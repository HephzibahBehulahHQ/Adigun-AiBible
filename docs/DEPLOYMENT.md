# Deployment

The public product is hosted at https://adigun-aibible.hephzibahbehulah.com/.

GitHub Pages uses GitHub Actions. The `Validate and deploy Adigun-AiBible` workflow validates every pull request to `main`. A push to `main`, or a manual workflow run on `main`, runs the locked Node.js 24 build and deploys its `dist/` artifact.

The workflow runs TypeScript, ESLint, automated tests, source-corpus validation, the production build, and all desktop/mobile Chromium browser cases before deployment. A failing build cannot reach the deployment job. A newer commit cancels superseded checks for the same pull request; main-branch deployment runs remain serialized without cancellation. Browser reports and screenshots are retained as CI artifacts for seven days. Only the deployment job receives Pages write and OIDC permissions. After its receipt gate passes, a read-only job launches real desktop/mobile Chromium against the public custom domain, checks the rendered homepage and Genesis reader, and retains screenshots for seven days. Official GitHub actions are pinned to verified release commit SHAs.

Vite, the manifest, runtime content and the service worker use the custom-domain root `/` (not the `/Adigun-AiBible/` project path). The `CNAME` file configures the public domain. Hash routes permit direct links and refreshes on GitHub Pages.

After a deployment succeeds, inspect `/build-info.json` on the custom domain and confirm `sourceCommit` equals the deployed main revision. The post-deployment Chromium gate verifies that the real homepage and an exact Genesis source-reader route render at the published revision; manual navigation through book/chapter controls remains useful for release acceptance. A successful deployment publishes the current product; it does not certify pending editorial reviews, untranslated editions or unavailable connected services.

Roll back by reverting the specific source change on `main` and letting the same validated workflow redeploy. Preserve history and user study data.
