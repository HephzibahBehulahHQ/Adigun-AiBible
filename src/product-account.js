import "./product-account.css";

async function accountRequest(data) {
  const response = await fetch("/api/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

const errors = {
  "invalid-product-credentials": "Check your AiBible email and password.",
  "invalid-or-expired-email-code": "That code is incorrect or expired.",
  "email-code-request-required": "Request a new email code to continue.",
  "product-account-not-authorized": "Try signing in or resetting your AiBible password.",
  "wait-and-retry": "Too many requests. Wait a minute and try again.",
};

export function mountProductAccount() {
  const workspace = document.querySelector("#root");
  const accountButton = document.createElement("button");
  accountButton.type = "button";
  accountButton.className = "aibible-account-launch";
  accountButton.textContent = "Account";
  document.body.append(accountButton);

  const dialog = document.createElement("dialog");
  dialog.className = "product-account";
  dialog.setAttribute("aria-labelledby", "product-account-title");
  dialog.innerHTML = `
    <h2 id="product-account-title">AdigunAiBible account</h2>
    <p>Use your own AiBible account, or try the tools for four minutes.</p>
    <form>
      <div data-credentials>
        <label>Action <select name="mode">
          <option value="sign-in">Sign in</option>
          <option value="register">Create account</option>
          <option value="reset-password">Reset password</option>
        </select></label>
        <label>Email <input name="email" type="email" autocomplete="email" required></label>
        <label data-password-label>Password <input name="password" type="password"
          autocomplete="current-password" minlength="12" maxlength="256" required></label>
      </div>
      <label data-code hidden>Email code <input name="code" inputmode="numeric"
        autocomplete="one-time-code" pattern="[0-9]{6,10}" disabled required></label>
      <button type="submit">Send email code</button>
      <button type="button" data-restart hidden>Start again</button>
    </form>
    <p role="status"></p>
    <div class="product-account-actions">
      <button type="button" data-guest>Start four-minute trial</button>
      <button type="button" data-close hidden>Back to tools</button>
      <button type="button" data-signout hidden>Sign out</button>
    </div>`;
  document.body.append(dialog);

  const find = (selector) => dialog.querySelector(selector);
  const form = find("form");
  const { email, password, code, mode } = form.elements;
  const submit = find('[type="submit"]');
  const message = find('[role="status"]');
  const guest = find("[data-guest]");
  const close = find("[data-close]");
  const signout = find("[data-signout]");
  const restart = find("[data-restart]");
  let timer;
  let trialAvailable = true;
  let signedIn = false;
  let verifying = false;

  function setVerification(active) {
    verifying = active;
    find("[data-credentials]").hidden = active;
    find("[data-code]").hidden = !active;
    email.disabled = active;
    password.disabled = active;
    mode.disabled = active;
    code.disabled = !active;
    password.value = "";
    code.value = "";
    restart.hidden = !active;
    submit.textContent = active ? "Verify email code" : "Send email code";
    if (active) code.focus();
  }

  function showAccount() {
    form.hidden = signedIn;
    signout.hidden = !signedIn;
    guest.hidden = !trialAvailable || !workspace.inert;
    close.hidden = workspace.inert;
    if (!dialog.open) dialog.showModal();
  }

  function updateAccess(result) {
    clearTimeout(timer);
    signedIn = result.step === "signed-in";
    if (typeof result.trialAvailable === "boolean") trialAvailable = result.trialAvailable;
    const remaining = Number(result.remainingMs) || 0;
    workspace.inert = !signedIn && remaining <= 0;
    if (workspace.inert) {
      showAccount();
      return;
    }
    if (dialog.open) dialog.close();
    if (remaining > 0) {
      if (!signedIn) trialAvailable = false;
      timer = setTimeout(() => {
        message.textContent = signedIn
          ? "Your session ended. Sign in to continue."
          : "Your guest trial ended. Sign in to continue.";
        updateAccess({ step: "guest", remainingMs: 0 });
      }, remaining);
    }
  }

  async function run(button, operation) {
    button.disabled = true;
    try {
      await operation();
    } catch (error) {
      message.textContent = errors[error.message] || "Account service unavailable. Try again.";
    } finally {
      button.disabled = false;
    }
  }

  workspace.inert = true;
  mode.addEventListener("change", () => {
    password.autocomplete = mode.value === "sign-in" ? "current-password" : "new-password";
  });
  accountButton.addEventListener("click", showAccount);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    if (workspace.inert) event.preventDefault();
  });
  restart.addEventListener("click", () => {
    setVerification(false);
    message.textContent = "";
    email.focus();
  });
  guest.addEventListener("click", () => run(guest, async () => {
    const result = await accountRequest({ step: "guest", allowStart: true });
    trialAvailable = false;
    if (!result.remainingMs) message.textContent = "Your guest trial ended. Sign in to continue.";
    updateAccess(result);
  }));
  signout.addEventListener("click", () => run(signout, async () => {
    await accountRequest({ step: "sign-out" });
    updateAccess(await accountRequest({ step: "guest" }));
  }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run(submit, async () => {
      if (!verifying) {
        await accountRequest({ step: "begin", mode: mode.value, email: email.value, password: password.value });
        setVerification(true);
        message.textContent = "Enter the code sent to your email.";
        return;
      }
      const result = await accountRequest({ step: "verify", code: code.value });
      setVerification(false);
      mode.value = "sign-in";
      mode.dispatchEvent(new Event("change"));
      if (result.step === "signed-in") {
        message.textContent = "";
        updateAccess(result);
      } else {
        message.textContent = result.step === "registered"
          ? "Account verified. Sign in with your password and a new email code."
          : "Password updated. Sign in with your new password and email code.";
      }
    });
  });
  void accountRequest({ step: "guest" }).then(updateAccess, () => {
    message.textContent = "Account service unavailable. Try again.";
    showAccount();
  });
}
