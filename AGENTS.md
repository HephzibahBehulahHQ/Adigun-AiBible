# Adigun-AiBible execution instructions

## Authority and scope

Adopt `HephzibahBehulahHQ/hb-AI-policy@d42d4e04ac6ab77ebafa1d4fccb724a4dde8d02e` as the pinned policy baseline. Follow the user’s instructions, the environment’s instruction hierarchy, and actual access controls. Read relevant policy files at that revision; do not silently substitute a moving branch.

The user has authorized this project’s implementation, scoped commits and verified pushes, merge and deployment, and the requested global hb-AI-policy update. Continue authorized work without asking for the same permission again. Corporate-site, design-system, and evangelism reference repositories are read-only. Sending messages to others and unrelated changes require their own authorization.

## Start and resume

Read `CODEX_START_HERE.md` and `docs/agent/PROJECT_STATUS.md`. The current implementation branch is `codex/bible-v3-expansion-20261104`; inspect the actual checkout before acting. Read `docs/specs/Adigun-AiBible_Codex_Master_Prompt.md` once per fresh execution context, then read only changed or relevant subsections. Preserve existing useful code, user changes, Git history, package-manager conventions, and completed work.

Use compact searches and reads. Reuse clean supplied text as-is unless the user requests a rewrite. Do not repeat the full specification, unchanged plans, or large files in prompts or reports. Keep current evidence, actual blockers, last verified remote commit, and the next concrete action in the status file.

## Execution

Use one primary implementer. Additional agents must have a justified, bounded independent task, explicit ownership, and a concrete deliverable. Avoid overlapping writes; the implementer reviews and integrates their output.

Select models or reasoning effort according to task risk and controls actually available in the environment. Never claim a model switch without a supported operation and evidence. Continue with the available model when switching is unavailable.

Choose routine implementation details autonomously. Continue independent work around genuine external dependencies. Do not add placeholders, dummy records, fabricated quotations, fake activity, simulated integrations, or invented verification. State real service prerequisites clearly.

Preserve the specification’s licensing, human editorial review, security, accessibility, and release requirements. An agent cannot certify itself as a human reviewer. Run checks proportionate to material risk, fix relevant failures, and stop optional testing once adequately verified. Merge and deploy under standing authorization after genuine gates pass; verify the actual deployed revision and URL.

## Synchronization

While changes exist, create scoped WIP checkpoints and push at least every five minutes and before long operations. Run appropriate fast checks, record failures and unrun checks honestly, exclude secrets, and verify the intended commit against the remote branch SHA. Record commit and verification time in `docs/agent/PROJECT_STATUS.md`.

If synchronization remains blocked for ten minutes, stop further unsynchronized implementation. Preserve the local checkpoint and exact blocker, and report the next recovery action. Do not claim a push or deployment succeeded without verification.

## Routine reporting

Use only these fields:

STATUS
- Done: Completed changes.
- Tested: Checks actually run and outcomes; identify failed or unrun checks.
- ESTIMATED FINISH TIME: Remaining hours and minutes for the full requested task, or unknown.
- ETA: Dated completion estimate in Europe/Berlin time, or pending.
- Next: One concrete next action.

Estimate the full task, not only the next milestone. Keep branch and environment details in the status file rather than adding report fields.
