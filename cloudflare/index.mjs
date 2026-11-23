import accountWorker from "./account.mjs";

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname === "/api/account")
      return accountWorker.fetch(request, env);
    return env.ASSETS.fetch(request);
  },
};
