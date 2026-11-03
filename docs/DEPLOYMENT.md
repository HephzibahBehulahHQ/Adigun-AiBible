# Deployment

The public product is hosted at https://hephzibahbehulahhq.github.io/Adigun-AiBible/.

GitHub Pages uses GitHub Actions. The `Validate and deploy Adigun-AiBible` workflow validates every pull request to `main`. A push to `main`, or a manual workflow run on `main`, runs the locked Node.js 24 build and deploys its `dist/` artifact.

The workflow runs TypeScript, ESLint, automated tests, source-corpus validation the production build, and all desktop/mobile Chromium browser cases before deployment. A failing build cannot reach the deployment job. Only the deployment job receives Pages write and OIDC permissions. Official GitHub actions are pinned to verified release commit SHAs.

Vite, the manifest, runtime content and the service worker use the `/Adigun-AiBible/` project path. Hash routes permit direct links and refreshes on GitHub Pages. No custom domain or audience change is required.

After a deployment succeeds, inspect `/Adigun-AiBible/build-info.json` and confirm `sourceCommit` equals the deployed main revision. Open the reader, change book/chapter and verify a direct hash route. A successful deployment publishes the current product; it does not certify pending editorial reviews, untranslated editions or unavailable connected services.

Roll back by reverting the specific source change on `main` and letting the same validated workflow redeploy. Preserve history and user study data.
