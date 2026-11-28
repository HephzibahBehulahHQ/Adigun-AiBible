import accountWorker from "./account.mjs";
import { translateReadingPassage } from "./reader-translation.mjs";

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/reader-translation")
      return translateReadingPassage(request, env);
    if (pathname === "/api/account")
      return accountWorker.fetch(request, env);
    return env.ASSETS.fetch(request);
  },
};
