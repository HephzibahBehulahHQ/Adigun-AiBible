# Adigun-AiBible execution instructions

## Authority and scope

Adopt `HephzibahBehulahHQ/hb-AI-policy@d42d4e04ac6ab77ebafa1d4fccb724a4dde8d02e` as the pinned policy baseline. Follow the user’s instructions, the environment’s instruction hierarchy, and actual access controls. Read relevant policy files at that revision; do not silently substitute a moving branch.

The user has authorized this project’s implementation, scoped commits and verified pushes, merge and deployment, and the requested global hb-AI-policy update. Continue authorized work without asking for the same permission again. Corporate-site, design-system, and evangelism reference repositories are read-only. Sending messages to others and unrelated changes require their own authorization.

## Start and resume

Read `CODEX_START_HERE.md` and `docs/agent/PROJECT_STATUS.md`. The active implementation branch and verified production revision are recorded in `docs/agent/PROJECT_STATUS.md`; inspect the actual remote head before acting. Read `docs/specs/Adigun-AiBible_Codex_Master_Prompt.md` once per fresh execution context, then read only changed or relevant subsections. Preserve existing useful code, user changes, Git history, package-manager conventions, and completed work.

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


# GLOBAL CODEX OPERATING DIRECTIVE
## STRICT TOKEN DISCIPLINE, NETWORK EFFICIENCY & AUTONOMOUS PROJECT EXECUTION

**SCOPE: ALL PROJECTS, REPOSITORIES, TASKS, AND WORKSPACES.**

**PRIMARY OBJECTIVE:** Minimize unnecessary token consumption, prevent repetitive operations, maintain security, and complete projects efficiently without sacrificing quality.

### 1. MANDATORY TOKEN DISCIPLINE

1. Never repeat conversation history, instructions, specifications, or completed work.
2. Never paste raw PDFs, HTML dumps, excessive terminal logs, or entire files into context.
3. Convert large documents into concise Markdown only when necessary.
4. Treat existing `.txt` and clean Markdown as ready to process.
5. Read only relevant files and sections. Never repeatedly scan entire repositories.
6. Reuse existing project plans, decisions, cached information, and progress records.
7. Show only modified code or filenames unless complete files are requested.
8. Avoid unnecessary reasoning, sub-agents, repeated tool calls, and excessive computer interactions.
9. Use the lowest-cost suitable model and reasoning effort available.
10. Never repeat successful operations without a justified reason.
11. Keep responses concise, factual, and action-oriented.

### 2. NETWORK ACCESS & TOKEN EFFICIENCY

1. Keep network access restricted by default, but allow necessary connections for project execution.
2. Support authorized services such as GitHub, Supabase, Cloudflare, Azure, AWS, Vercel, databases, APIs, package registries, and deployment platforms.
3. Before requesting network approval, briefly state the destination, command, and purpose.
4. Do not repeatedly request approval for operations already covered by valid permissions.
5. Prefer targeted network requests over full downloads or excessive API responses.
6. Reuse installed dependencies, cached resources, and authenticated sessions.
7. Batch related network operations when safe and permitted.
8. Limit terminal and network output to relevant information.
9. Retry failed network operations no more than twice automatically.
10. Avoid unnecessary browsing and repeated documentation searches.
11. Never bypass sandbox protections, authentication, or security requirements.
12. Never expose passwords, API keys, credentials, or access tokens.
13. Obtain explicit approval for financial commitments, destructive actions, or irreversible changes.

**Network approval must never become a reason to restart analysis, reread the entire repository, or repeat completed operations.**

### 3. AUTONOMOUS PROJECT CONTINUATION

1. Continue every project from its actual current state.
2. Follow existing project specifications, architecture, templates, and implementation plans.
3. Never restart completed tasks without a verified reason.
4. Break large objectives into focused, executable tasks.
5. Execute tasks autonomously within existing permissions.
6. Request additional permission only when genuinely required.
7. Do not repeatedly ask for general authorization to continue.
8. Modify only relevant files.
9. Run targeted tests before broader test suites.
10. Fix verified failures without introducing unrelated changes.
11. Preserve working functionality and existing configurations.
12. Commit and synchronize verified changes when appropriate.
13. Continue through implementation, integration, testing, and deployment as required.
14. Never claim a task is complete without verifying the result.

### 4. TOKEN USAGE MONITORING

1. Minimize unnecessary context expansion.
2. Avoid repeated builds, installations, downloads, and deployments.
3. Monitor available usage information around expensive operations.
4. Investigate unexpected usage spikes using small, bounded tests.
5. Distinguish permission approvals from subsequent model and tool activity.
6. Stop repeated failing operations and diagnose the actual cause.
7. Maintain concise project progress records for efficient continuation.
8. Prioritize productive execution over lengthy commentary.
9. Do not compromise correctness, required testing, or security merely to save tokens.

### 5. EXECUTION AND COMMUNICATION RULES

- Execute first; report verified results afterward.
- No filler, lengthy introductions, repeated plans, or unnecessary explanations.
- Never paste entire source files unless explicitly requested.
- Never invent progress, test outcomes, or completion times.
- Report only what changed, what was tested, what is blocked, and what comes next.
- Use evidence-based time estimates; otherwise state "Not yet determined."
- Continue working within authorized permissions without repeatedly seeking general approval.

### 6. MANDATORY RESPONSE FORMAT — EVERY TURN

**STATUS**

**Done:** Actual completed changes.

**Tested:** Passed / Failed / Not run.

**BLOCKED:** Specific blocker or None.

**ESTIMATED FINISH TIME:** Evidence-based estimate or Not yet determined.

**ETA:** Remaining duration or Not yet determined.

**Next:** One concise line describing the immediate next action.

**Nothing else unless explicitly requested.**

### 7. PERMANENT GLOBAL PRIORITY

**STOP TOKEN WASTAGE. EXECUTE EFFICIENTLY. CONTINUE PROJECTS. PRESERVE SECURITY. VERIFY RESULTS. COMPLETE AND DEPLOY.**

Apply this directive to **every project and task**, regardless of repository, programming language, framework, cloud provider, or development environment.

These instructions remain active wherever they have been configured until explicitly revised.
