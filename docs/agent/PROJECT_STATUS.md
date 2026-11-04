# Project status

Updated: 4 November 2026, 17:48 Europe/Berlin.

- Objective: continue Version 3 from the verified release; the expanded product is not complete.
- Branch: `codex/workspace-navigation-20261104`, based on main `8ed0aa73cdf759a36c923d09e3889c979104379e`.
- Verified production: PR #4 private reading history and source-bound study tabs is deployed. Production workflow [41838579813](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41838579813) passed build, browser, persistence and Pages deployment steps. The live receipt was rechecked on this continuation: source `8ed0aa73cdf759a36c923d09e3889c979104379e`, build `cb36e75e60a3b0f500f96fac`, content `ebbf21b44f84c76c567d50b7`. PR #5 publisher notes, poetry and source context is included.
- Production URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . Receipt: https://hephzibahbehulahhq.github.io/Adigun-AiBible/build-info.json .
- Released checks: 181 application/source/session tests, 20 offline backend contracts, 84 desktop/mobile browser cases and 10 repeated persistence checks on the integrated release. Exact results and live verification are recorded in [PR #4](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/4).
- Active slice: shared route registry fixes saved-position fallback on advanced tool links; an accessible local command palette and named display/panel layouts extend the existing reader. Current feature and release gates remain pending; no new deployment claimed.
- Last verified remote checkpoint: main `8ed0aa73cdf759a36c923d09e3889c979104379e`; new work-branch checkpoint is being prepared. The saved prior continuation documents were older than the actual merged release and have been reconciled against GitHub and the public receipt.
- External gates remain unchanged in [BLOCKERS.md](BLOCKERS.md): real human editorial/native-language review, edition-specific acquisition and permissions, the interrupted dedicated backend setup, authenticated model service, licensed recorded narration and native-platform environments. No unrelated backend is reused and no interrupted setup is retried without explicit resumption. Offline contract tests do not establish live backend security.
- Next: checkpoint the navigation slice, complete saved layouts, then run the exact-candidate release gates and deploy under standing authorization.
