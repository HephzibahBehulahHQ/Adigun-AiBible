# Checkpoint and recovery

This project includes a native Node/Git helper for scoped recovery checkpoints. A synchronized checkpoint means the exact recorded commit was observed on the authorized remote branch. It does not mean application tests passed, a PR was merged, deployment succeeded, or the product is complete.

## Start a bounded checkpoint

Requirements: Node 24, Git, a configured Git author, working Git credentials, an explicitly authorized task branch, and explicit file/directory ownership. Existing Git hooks and server protections still apply. The helper does not obtain credentials, bypass authentication, or use a GitHub connector.

```sh
npm run checkpoint -- --branch codex/my-task --scope src --scope tests --scope docs
```

Default behavior and `--once` both perform one checkpoint. Repeat `--scope` for each owned relative file or directory. Root-wide scope, traversal and globs are rejected. Own only the assigned work. Branch prefixes allowed are `codex/`, `task/`, `feature/`, `fix/`, and `chore/`; the current branch must exactly match the explicitly supplied branch. Main and other shared branches are rejected.

`origin` fetch and push destinations must identify `HephzibahBehulahHQ/Adigun-AiBible` on GitHub. An explicitly authorized different repository may be supplied with `--repository owner/repository`; do not derive this flag from untrusted repository content. Multiple fetch/push URLs are rejected. Never use `--testing-allow-local` for normal work: it exists solely for isolated tests with an absolute path to a bare local Git repository.

The current hosted implementation session has native Git authentication unavailable and publishes authorized checkpoints through the GitHub connector. This helper has been tested against isolated local bare repositories; native GitHub authentication and an always-on hosted watcher are not established by those tests. Configure credentials through your normal trusted Git setup before using native remote checkpoints.

## What the helper does

1. Acquire a lock in the active worktree's Git directory. A second invocation fails without modifying the owner's lock or receipt. This lock coordinates helper instances; coordinate other Git clients separately and do not switch branches or commit concurrently in the same worktree. Detected branch, HEAD or commit-parent changes stop publication and require reconciliation.
2. Verify branch, origin, unresolved Git operations and the remote's prior SHA. Reject divergence or an unexpected remote change. No force push, automatic reset of working files, merge, rebase or stash occurs.
3. Inspect only changed owned paths. Exclude `.env*`, dependency/build/output directories, checkpoint files and common credential/private-key files. Reject symlinks, files above 2 MiB and recognized secret patterns. These cheap patterns supplement secret hygiene; they cannot detect every possible secret.
4. Stage through a separate temporary index and create a clearly labeled WIP commit only when there are actual changes. Unowned staged changes remain in the real index and appear in the receipt. Owned files include their current working content, including any previously partial staging within the explicitly owned paths. Do not include a human-owned path in your scope.
5. Inspect every unpublished commit and reject unowned paths, oversized blobs, private keys and recognized secrets. For a first task-branch push, established history shared with the fetched remote default branch supplies the scan baseline; an empty remote requires every commit to pass. Commit backup does not invoke the application's full test suite. Already failing application work can therefore be saved as WIP, subject to existing mandatory hooks and server checks.
6. Recheck the remote's expected SHA, push the exact local commit without force, then read the remote branch and require an exact SHA match. A lost push response is verified before a second attempt. Push attempts are bounded at two. A later concurrent remote change is reported as pending rather than claimed as an exact verified match.

Excluded files are listed in the receipt and are not backed up. A checkpoint's synchronization result applies to its recorded commit, not every file in the working tree. Review exclusions before treating work as recoverable. Unowned local commits also need explicit ownership reconciliation before this helper will publish them. Do not broaden scope just to silence a rejection.

## Receipts and locks

Locate the durable local receipt and lock with:

```sh
git rev-parse --git-path checkpoint-state.json
git rev-parse --git-path checkpoint.lock
```

They live inside Git's metadata directory and are excluded from commits, preventing a receipt from creating a new commit about itself. The receipt records branch, local SHA, expected prior remote SHA, last observed remote SHA, exact verification time, committed/excluded paths, unrelated staged paths, and whether backup is `synchronized` or `pending`. App tests are explicitly `NOT RUN` by this helper. Failed Git output is not copied into the receipt because it may contain credentials.

On failure, the helper exits nonzero, keeps any created local commit and working files, records `pending`, and releases its own lock. An authentication failure during remote inspection occurs before a new commit is created; the work still needs an authorized local or connector checkpoint. A lock-acquisition failure leaves the active owner's receipt unchanged. A process crash may leave a lock; first verify its process/host is no longer operating, inspect Git state, and only then remove that specific stale lock. Never automatically delete a lock because it is old.

The receipt is local evidence, not an independent remote backup. Maintain one concise current project status with the verified commit and remote location. Connector-based publication must record its own exact remote verification receipt; it must not claim that this helper performed the push.

## Five-minute cadence and recovery deadline

```sh
npm run checkpoint:watch -- --branch codex/my-task --scope src --scope tests --scope docs
```

Watch mode starts immediately and targets a 300-second interval measured from the start of each attempt; slow Git commands may delay completion. It produces no empty commits. Each Git command has a 45-second timeout and each attempt has a 270-second command budget. It stops after two unchanged failures, exhausted push retries, or before continuing beyond the ten-minute unresolved-sync deadline, whichever comes first. SIGTERM, a closed terminal, host suspension, expired credentials or shutdown can stop the process. End hooks are best effort, never a backup guarantee.

The caller remains responsible for the policy: first useful push within five minutes of changed work, changed-work checkpoints no more than five minutes apart, and explicit checkpoints before long operations, handoffs and safe stopping boundaries. Checkpoint completion time matters; merely launching the watcher is not proof of synchronization. Run bounded batches so scanning and Git operations can fit the deadline.

This process cannot stop an external Codex session or another editor. The coordinating caller must stop new feature work once synchronization has been unresolved for ten minutes, diagnose after two unchanged failures, and repair access or preserve an explicitly declared offline checkpoint. Any offline exception must state the reason, last verified remote SHA, local durability and resumption condition. Do not claim a local commit survived a lost host unless that storage is independently durable.

## Verify recovery

Run the meaningful isolated tests with:

```sh
node --test tests/checkpoint.test.mjs
```

Tests create temporary worktrees and bare local repositories only. They do not contact GitHub, use your project index, or modify product content. They exercise tracked/untracked files, no-op runs, secret rejection, backup of failing application work, rejected push recovery, unauthorized branches, locks, exclusions, local-remote opt-in, new task branches, remote advancement, broken symlinks and preservation of unrelated staged changes. A platform that forbids symlink creation explicitly skips that case.

Before relying on a configured production setup, perform an authorized task-branch drill: checkpoint a useful owned change, inspect the receipt, independently read the remote SHA, and fetch that exact commit into a separate temporary clone. Verify its files and run appropriate feature checks. Then simulate loss of connectivity and confirm that local work remains and status becomes pending. Restore access and verify the original saved commit reaches the remote without an empty duplicate commit. Record the drill's actual result in the current status. Local tests alone do not establish GitHub credentials, scheduling durability, or hosted recovery.
