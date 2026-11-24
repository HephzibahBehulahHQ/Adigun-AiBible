const cookieName = "__Host-adigunaibible-account";
const guestCookieName = "__Host-adigunaibible-trial";
const sessionCookieName = "__Host-adigunaibible-session";
const sessionAge = 8 * 60 * 60;
const guestDuration = 240_000;
const guestCookieAge = 365 * 24 * 60 * 60;
const challengeTime = 10 * 60_000;
const textEncoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/account")
      return reply(404, { error: "not-found" });
    const origin = request.headers.get("Origin");
    if (origin !== url.origin) return reply(403, { error: "origin-required" });
    if (request.method !== "POST")
      return reply(405, { error: "method-not-allowed" });
    return handleRequest(request, env, origin);
  },
};

async function handleRequest(request, env, origin) {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_PUBLISHABLE_KEY ||
    !env.ACCOUNT_SECRET ||
    !env.ACCOUNT_RPC_PROOF ||
    !env.ACCOUNT_LIMITER
  ) {
    return reply(503, { error: "account-unavailable" });
  }
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return reply(415, { error: "json-required" });
    const body = await request.json().catch(() => null);
    const bucket = body?.step === "guest" ? "guest:" : "ip:";
    if (!(await env.ACCOUNT_LIMITER.limit({ key: bucket + ip })).success)
      return reply(429, { error: "wait-and-retry" });
    if (body?.step === "guest") return await guestTrial(body, request, env);
    if (body?.step === "sign-out")
      return reply(200, { step: "signed-out" }, cookie("", 0, sessionCookieName));
    if (body?.step === "begin") {
      return await begin(body, env, origin);
    }
    if (body?.step === "verify")
      return await verify(body, request, env, origin);
    return reply(400, { error: "invalid-request" });
  } catch {
    return reply(503, { error: "account-unavailable" });
  }
}

function readCookie(request, name) {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(name + "="))
    ?.slice(name.length + 1);
}

async function guestTrial(body, request, env) {
  const session = await open(env, readCookie(request, sessionCookieName));
  if (session?.kind === "session" && session.expiresAt > Date.now())
    return reply(200, { step: "signed-in", remainingMs: session.expiresAt - Date.now() });
  const saved = readCookie(request, guestCookieName);
  const trial = saved ? await open(env, saved) : null;
  const now = Date.now();
  if (trial?.kind === "guest" && Number.isSafeInteger(trial.expiresAt)) {
    return reply(200, {
      step: "guest",
      remainingMs: Math.max(0, trial.expiresAt - now),
      trialAvailable: false,
    });
  }
  if (saved || body.allowStart !== true)
    return reply(200, { step: "guest", remainingMs: 0, trialAvailable: !saved });
  const value = await seal(env, {
    kind: "guest",
    expiresAt: now + guestDuration,
  });
  return reply(
    200,
    { step: "guest", remainingMs: guestDuration },
    cookie(value, guestCookieAge, guestCookieName),
  );
}

async function begin(body, env, origin) {
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const { mode, password } = body;
  if (
    !["register", "sign-in", "reset-password"].includes(mode) ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  ) {
    return reply(400, { error: "invalid-email-or-password" });
  }

  if (
    !(
      await env.ACCOUNT_LIMITER.limit({
        key: "email:" + (await mac(env, "limit", email)),
      })
    ).success
  ) {
    return reply(429, { error: "wait-and-retry" });
  }

  const passwordProof = await mac(
    env,
    "product-password",
    JSON.stringify([email, password]),
  );
  if (mode === "sign-in") {
    const accepted = await rpc(env, "adigunaibible_check_product_password", {
      email_address: email,
      password_proof: passwordProof,
    });
    if (!accepted) return reply(401, { error: "invalid-product-credentials" });
  }
  const otpPath = new URL("/auth/v1/otp", env.SUPABASE_URL);
  otpPath.searchParams.set("redirect_to", origin);
  const sent = await provider(env, otpPath.pathname + otpPath.search, {
    email,
    create_user: mode === "register",
  });
  if (sent.status === 429) return reply(429, { error: "wait-and-retry" });
  if (!sent.ok) {
    const detail = await sent.json().catch(() => null);
    const code = detail?.error_code ?? detail?.code;
    if (
      mode !== "reset-password" ||
      !["otp_disabled", "user_not_found"].includes(code)
    ) {
      return reply(503, { error: "email-code-unavailable" });
    }
  }

  const challenge = await seal(env, {
    mode,
    email,
    passwordProof,
    origin,
    expiresAt: Date.now() + challengeTime,
  });
  return reply(
    200,
    { step: "verify" },
    cookie(challenge, challengeTime / 1000),
  );
}

async function verify(body, request, env, origin) {
  const saved = readCookie(request, cookieName);
  const challenge = await open(env, saved);
  if (
    !challenge ||
    challenge.origin !== origin ||
    challenge.expiresAt <= Date.now()
  )
    return reply(400, { error: "email-code-request-required" });
  if (typeof body.code !== "string" || !/^\d{6,10}$/.test(body.code))
    return reply(400, { error: "invalid-email-code" });
  const checked = await provider(env, "/auth/v1/verify", {
    email: challenge.email,
    token: body.code,
    type: "email",
  });
  if (checked.status === 429) return reply(429, { error: "wait-and-retry" });
  if (checked.status >= 500)
    return reply(503, { error: "account-unavailable" });
  if (!checked.ok)
    return reply(401, { error: "invalid-or-expired-email-code" });
  const session = await checked.json();
  if (
    !session?.access_token ||
    !session.refresh_token ||
    !session.user?.email_confirmed_at ||
    session.user.is_anonymous ||
    session.user.email?.toLowerCase() !== challenge.email
  ) {
    return reply(503, { error: "account-unavailable" });
  }

  const registration = challenge.mode === "register";
  const recovery = challenge.mode === "reset-password";
  const operation = registration
    ? "adigunaibible_activate_product_account"
    : recovery
      ? "adigunaibible_reset_product_password"
      : "adigunaibible_verify_product_session";
  const accepted = await rpc(
    env,
    operation,
    {
      email_address: challenge.email,
      password_proof: challenge.passwordProof,
    },
    session.access_token,
  );
  const cleared = cookie("", 0);
  if (!accepted)
    return reply(
      registration ? 409 : 401,
      { error: "product-account-not-authorized" },
      cleared,
    );
  if (registration) return reply(200, { step: "registered" }, cleared);
  if (recovery) return reply(200, { step: "password-reset" }, cleared);
  const sessionValue = await seal(env, {
    kind: "session",
    expiresAt: Date.now() + sessionAge * 1000,
  });
  return reply(200, { step: "signed-in", remainingMs: sessionAge * 1000 }, [
    cleared,
    cookie(sessionValue, sessionAge, sessionCookieName),
  ]);
}

function provider(env, path, data, token, schema) {
  const headers = {
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = "Bearer " + token;
  if (schema) headers["Content-Profile"] = schema;
  return fetch(new URL(path, env.SUPABASE_URL), {
    method: "POST",
    headers,
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  });
}

async function rpc(env, name, data, token) {
  const prefix = env.PRODUCT_ACCOUNT_PREFIX ?? "adigunaibible";
  if (!["adigunaibible", "adigunaibible_preview"].includes(prefix))
    throw new Error("Invalid account namespace");
  const response = await provider(
    env,
    "/rest/v1/rpc/" + name.replace(/^adigunaibible/, prefix),
    { ...data, worker_proof: env.ACCOUNT_RPC_PROOF },
    token,
    "public",
  );
  if (!response.ok) throw new Error("Account authorization unavailable");
  const allowed = await response.json();
  if (typeof allowed !== "boolean")
    throw new Error("Invalid account authorization result");
  return allowed;
}

function reply(status, payload, setCookie) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  for (const value of [setCookie].flat().filter(Boolean))
    headers.append("Set-Cookie", value);
  return Response.json(payload, { status, headers });
}

function cookie(value, expires, name = cookieName) {
  return `${name}=${value}; Path=/; Max-Age=${expires}; Secure; HttpOnly; SameSite=Lax`;
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function unhex(string) {
  return Uint8Array.from(string.match(/../g), (byte) => parseInt(byte, 16));
}

async function mac(env, purpose, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode("adigunaibible:" + purpose + ":" + env.ACCOUNT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

async function sealKey(env) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode("adigunaibible:challenge:" + env.ACCOUNT_SECRET),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal(env, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await sealKey(env),
    textEncoder.encode(JSON.stringify(data)),
  );
  return hex(iv) + "." + hex(ciphertext);
}

async function open(env, value) {
  if (!value || !/^[0-9a-f]{24}\.(?:[0-9a-f]{2}){17,1024}$/.test(value))
    return null;
  try {
    const [iv, ciphertext] = value.split(".");
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unhex(iv) },
      await sealKey(env),
      unhex(ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}

