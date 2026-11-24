import assert from "node:assert/strict";
import { test, mock } from "node:test";
import worker from "../cloudflare/account.mjs";

const origin = "https://preview.example.com";
const email = "reader@example.com";
const password = "A AiBible-only password";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-key",
  ACCOUNT_SECRET: "test-encryption-key",
  ACCOUNT_RPC_PROOF: "test-rpc-proof",
  ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
};

function post(data, cookie = "", from = origin) {
  return worker.fetch(
    new Request(origin + "/api/account", {
      method: "POST",
      headers: {
        Origin: from,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }),
    env,
  );
}
const begin = (mode, value = password) =>
  post({ step: "begin", mode, email, password: value });
const verify = (cookie, code = "123456") =>
  post({ step: "verify", code }, cookie);
const cookieFrom = (response) =>
  response.headers.get("Set-Cookie").split(";")[0];

test("product registration and every sign-in require email OTP before releasing a session", async () => {
  let account;
  let sent = 0;
  const mocked = mock.method(globalThis, "fetch", async (url, init) => {
    const payload = JSON.parse(init.body);
    if (url.pathname === "/auth/v1/otp") {
      assert.equal(url.searchParams.get("redirect_to"), origin);
      assert.equal(payload.email, email);
      assert.equal(payload.create_user, !account);
      sent++;
      return Response.json({});
    }
    if (url.pathname === "/auth/v1/verify") {
      assert.equal(payload.email, email);
      if (payload.token !== "123456") return Response.json({}, { status: 403 });
      return Response.json({
        access_token: "auth-access",
        refresh_token: "auth-refresh",
        user: { id: "test", email, email_confirmed_at: "2026-11-22" },
      });
    }
    assert.equal(init.headers["Content-Profile"], "public");
    assert.equal(payload.worker_proof, env.ACCOUNT_RPC_PROOF);
    assert.match(payload.password_proof, /^[a-f0-9]{64}$/);
    if (url.pathname.endsWith("/adigunaibible_check_product_password")) {
      assert.equal(init.headers.Authorization, undefined);
      return Response.json(account === payload.password_proof);
    }
    assert.equal(init.headers.Authorization, "Bearer auth-access");
    if (url.pathname.endsWith("/adigunaibible_activate_product_account")) {
      account = payload.password_proof;
      return Response.json(true);
    }
    if (url.pathname.endsWith("/adigunaibible_reset_product_password")) {
      account = payload.password_proof;
      return Response.json(true);
    }
    assert.ok(url.pathname.endsWith("/adigunaibible_verify_product_session"));
    return Response.json(account === payload.password_proof);
  });
  try {
    assert.equal(
      (await post({ step: "begin" }, "", "https://another-product.example.com"))
        .status,
      403,
    );
    assert.equal((await begin("sign-in")).status, 401);
    assert.equal(sent, 0);
    assert.equal((await verify("")).status, 400);

    const crossOrigin = await post(
      { step: "begin", mode: "register", email, password },
      "",
      "https://other.example.com",
    );
    assert.equal(crossOrigin.status, 403);
    const registration = await begin("register");
    assert.deepEqual(await registration.json(), { step: "verify" });
    assert.match(
      registration.headers.get("Set-Cookie"),
      /Secure; HttpOnly; SameSite=Lax/,
    );
    assert.equal(account, undefined);
    const challenge = cookieFrom(registration);
    const tampered =
      challenge.slice(0, -1) + (challenge.endsWith("0") ? "1" : "0");
    assert.equal((await verify(tampered)).status, 400);
    assert.equal((await verify(challenge, "000000")).status, 401);
    const activated = await verify(challenge);
    assert.deepEqual(await activated.json(), { step: "registered" });
    assert.ok(account);

    assert.equal((await begin("sign-in", "An unrelated password")).status, 401);
    assert.equal(sent, 1);
    const login = await begin("sign-in");
    assert.deepEqual(await login.json(), { step: "verify" });
    assert.equal(sent, 2);
    const signedIn = await verify(cookieFrom(login));
    assert.equal(signedIn.headers.get("Cache-Control"), "no-store");
    assert.match(signedIn.headers.get("Set-Cookie"), /Max-Age=0/);
    assert.deepEqual(await signedIn.json(), {
      step: "signed-in",
      remainingMs: 28_800_000,
    });
    const sessionCookie = signedIn.headers.getSetCookie()[1].split(";")[0];
    assert.match(sessionCookie, /^__Host-adigunaibible-session=/);
    assert.equal((await (await post({ step: "guest" }, sessionCookie)).json()).step, "signed-in");
    assert.match((await post({ step: "sign-out" }, sessionCookie)).headers.get("Set-Cookie"),
      /^__Host-adigunaibible-session=;.*Max-Age=0/);
    const replacement = "New product password 222";
    const recovery = await begin("reset-password", replacement);
    assert.deepEqual(await recovery.json(), { step: "verify" });
    assert.equal((await verify(cookieFrom(recovery), "000000")).status, 401);
    assert.deepEqual(await (await verify(cookieFrom(recovery))).json(), {
      step: "password-reset",
    });
    assert.equal((await begin("sign-in")).status, 401);
    assert.equal((await begin("sign-in", replacement)).status, 200);
  } finally {
    mocked.mock.restore();
  }
});

test("guest cookies retain one immutable four-minute deadline without Supabase", async () => {
  let now = 1_800_000_000_000;
  const clock = mock.method(Date, "now", () => now);
  try {
    const opened = await post({ step: "guest", allowStart: true });
    assert.equal(opened.headers.get("Cache-Control"), "no-store");
    assert.match(
      opened.headers.get("Set-Cookie"),
      /^__Host-adigunaibible-trial=.*; Secure; HttpOnly; SameSite=Lax$/,
    );
    assert.deepEqual(await opened.json(), {
      step: "guest",
      remainingMs: 240000,
    });
    const saved = cookieFrom(opened);
    now += 239999;
    const resumed = await post({ step: "guest", allowStart: true }, saved);
    assert.deepEqual(await resumed.json(), { step: "guest", remainingMs: 1, trialAvailable: false });
    assert.equal(resumed.headers.get("Set-Cookie"), null);
    now++;
    assert.deepEqual(
      await (await post({ step: "guest", allowStart: true }, saved)).json(),
      { step: "guest", remainingMs: 0, trialAvailable: false },
    );
    assert.deepEqual(
      await (await post({ step: "guest", allowStart: false })).json(),
      { step: "guest", remainingMs: 0, trialAvailable: true },
    );
    assert.deepEqual(
      await (
        await post(
          { step: "guest", allowStart: true },
          "__Host-adigunaibible-trial=invalid",
        )
      ).json(),
      { step: "guest", remainingMs: 0, trialAvailable: false },
    );
  } finally {
    clock.mock.restore();
  }
});

