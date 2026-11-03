#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CADENCE_MS = 300_000;
const SYNC_LIMIT_MS = 600_000;
const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_REPOSITORY = 'HephzibahBehulahHQ/Adigun-AiBible';
let operationDeadline = Infinity;
const SECRETS = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\b(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'](?!example["']|placeholder["'])[A-Za-z0-9_+/.=-]{16,}["']/i,
];

function git(cwd, args, { allowFailure = false, env = {}, binary = false } = {}) {
  const remaining = operationDeadline - Date.now();
  if (remaining <= 0) throw new Error('Checkpoint operation deadline reached; synchronization remains pending.');
  const result = spawnSync('git', args, {
    cwd, shell: false, encoding: binary ? null : 'utf8', timeout: Math.min(45_000, remaining),
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', ...env },
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    // Git output may contain remote credentials. Do not copy it into logs or receipts.
    throw new Error(`Git ${args[0]} failed (${result.error?.code ?? result.status}); inspect Git locally.`);
  }
  return binary ? result.stdout : result.stdout.trimEnd();
}

export function parseOptions(argv) {
  const options = { scopes: [], branch: '', repository: DEFAULT_REPOSITORY, watch: false, testingAllowLocal: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--once') options.watch = false;
    else if (arg === '--watch') options.watch = true;
    else if (arg === '--testing-allow-local') options.testingAllowLocal = true;
    else if (['--branch', '--scope', '--repository'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      if (arg === '--scope') options.scopes.push(value);
      else options[arg.slice(2)] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.branch || !/^(codex|task|feature|fix|chore)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(options.branch)) {
    throw new Error('Provide an explicitly authorized task branch with --branch; main/master and shared branches are forbidden.');
  }
  if (!options.scopes.length) throw new Error('Provide at least one owned file or directory with --scope.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository)) throw new Error('Invalid explicitly trusted repository identity.');
  options.scopes = options.scopes.map((scope) => {
    const clean = scope.replaceAll('\\', '/').replace(/\/$/, '');
    if (!clean || clean === '.' || path.posix.isAbsolute(clean) || clean.split('/').some((p) => !p || p === '..' || p === '.' || p === '.git') || /[\x00-\x1f:*?\[\]]/.test(clean)) {
      throw new Error('Scopes must be explicit relative files/directories, without root, traversal, or glob patterns.');
    }
    return clean;
  });
  return options;
}

function owned(file, scopes) {
  return scopes.some((scope) => file === scope || file.startsWith(`${scope}/`));
}

function excluded(file) {
  return file.split('/').some((part) => /^(?:node_modules|dist|\.git|\.openai|coverage|test-results|playwright-report)$/.test(part)
    || /^\.env(?:\.|$)/.test(part) || /^\.checkpoint(?:[.-]|$)/.test(part)
    || /^(?:id_rsa|id_ed25519|credentials(?:\.json)?|secrets?(?:\.json)?)$/i.test(part)
    || /\.(?:pem|key|p12|pfx)$/i.test(part));
}

function validateBuffer(buffer, file) {
  if (buffer.length > MAX_BYTES) throw new Error(`Oversized file excluded from checkpoint: ${file} (limit 2 MiB).`);
  if (SECRETS.some((pattern) => pattern.test(buffer.toString('utf8')))) throw new Error(`Potential secret in ${file}; checkpoint rejected.`);
}

function validateWorktreeFile(root, file) {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('File escaped repository root.');
  let cursor = root;
  for (const part of file.split('/')) {
    cursor = path.join(cursor, part);
    let partStat;
    try { partStat = fs.lstatSync(cursor); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (partStat.isSymbolicLink()) throw new Error(`Symlink excluded from checkpoint: ${file}.`);
  }
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error(`Non-regular file excluded from checkpoint: ${file}.`);
  if (stat.size > MAX_BYTES) throw new Error(`Oversized file excluded from checkpoint: ${file} (limit 2 MiB).`);
  validateBuffer(fs.readFileSync(absolute), file);
}

function validateOrigin(root, options) {
  for (const push of [false, true]) {
    const urls = git(root, ['remote', 'get-url', ...(push ? ['--push'] : []), '--all', 'origin']).split('\n');
    if (urls.length !== 1) throw new Error('Origin must have exactly one fetch URL and one push URL.');
    const url = urls[0];
    const match = /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url);
    if (match && match[1].toLowerCase() === options.repository.toLowerCase()) continue;
    if (options.testingAllowLocal && path.isAbsolute(url) && git(url, ['rev-parse', '--is-bare-repository'], { allowFailure: true }) === 'true') continue;
    throw new Error('Origin does not match the explicitly trusted repository. Local remotes require --testing-allow-local.');
  }
}

function remoteHead(root, branch) {
  const output = git(root, ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
  if (!output) return null;
  const lines = output.split('\n');
  if (lines.length !== 1 || !/^[a-f0-9]{40,64}\t/.test(lines[0])) throw new Error('Remote head response was ambiguous.');
  return lines[0].split('\t')[0];
}

function publishedBase(root, head) {
  // A first task-branch push may share established history with the remote default branch.
  const advertisement = git(root, ['ls-remote', '--symref', 'origin', 'HEAD']);
  const ref = /^ref: (refs\/heads\/[^\s]+)\tHEAD$/m.exec(advertisement)?.[1];
  if (!ref) return null; // Empty remote: every commit must pass the scope/secret checks.
  git(root, ['fetch', '--no-tags', 'origin', ref]);
  return git(root, ['merge-base', head, 'FETCH_HEAD'], { allowFailure: true });
}

function assertPendingScope(root, remote, head, scopes) {
  // Scan every unpublished commit, including files later removed, not just the final diff.
  const revisions = git(root, ['rev-list', ...(remote ? [`${remote}..${head}`] : [head])]).split('\n').filter(Boolean);
  for (const revision of revisions) {
    const files = git(root, ['diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '-r', '-z', revision]).split('\0').filter(Boolean);
    for (const file of new Set(files)) {
      if (!owned(file, scopes) || excluded(file)) throw new Error(`Unpublished commit contains an unowned or excluded file: ${file}. Expand scope only with authorization.`);
      const object = git(root, ['ls-tree', '-z', revision, '--', file]);
      if (!object) continue;
      if (!object.startsWith('100644 ') && !object.startsWith('100755 ')) throw new Error(`Non-regular Git object excluded: ${file}.`);
      const size = Number(git(root, ['cat-file', '-s', `${revision}:${file}`]));
      if (!Number.isFinite(size) || size > MAX_BYTES) throw new Error(`Oversized Git blob excluded: ${file}.`);
      validateBuffer(git(root, ['show', `${revision}:${file}`], { binary: true }), file);
    }
  }
}

function checkpoint(options, cwd = process.cwd()) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  const gitDir = path.resolve(root, git(root, ['rev-parse', '--git-dir']));
  const lockPath = path.join(gitDir, 'checkpoint.lock');
  const receiptPath = path.join(gitDir, 'checkpoint-state.json');
  const temporaryIndex = path.join(gitDir, `checkpoint-index-${process.pid}`);
  let lock;
  try { lock = fs.openSync(lockPath, 'wx', 0o600); }
  catch { throw new Error('Checkpoint lock exists or cannot be acquired; no work was changed.'); }
  const previousDeadline = operationDeadline;
  operationDeadline = Math.min(Date.now() + 270_000, options.deadline ?? Infinity);
  const receipt = {
    schema: 1, status: 'pending', startedAt: new Date().toISOString(),
    branch: null, localHead: null, expectedRemoteHead: null, remoteHead: null,
    remoteVerifiedAt: null, committedFiles: [], excludedFiles: [],
    unrelatedStagedFiles: [], checks: ['scope', 'secret patterns', 'size', 'remote identity', 'fast-forward'],
    applicationTests: 'NOT RUN: backup is independent of application test results',
  };
  const saveReceipt = () => {
    const temp = `${receiptPath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flush: true });
    fs.renameSync(temp, receiptPath);
  };
  try {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: receipt.startedAt }));
    receipt.branch = git(root, ['branch', '--show-current']);
    receipt.localHead = git(root, ['rev-parse', 'HEAD']);
    if (receipt.branch !== options.branch) throw new Error('Current branch is not the explicitly authorized task branch.');
    git(root, ['check-ref-format', '--branch', options.branch]);
    if (git(root, ['ls-files', '-u'])) throw new Error('Unresolved index conflicts require manual resolution.');
    for (const state of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
      if (fs.existsSync(path.resolve(root, git(root, ['rev-parse', '--git-path', state])))) throw new Error('Finish the existing Git operation before checkpointing.');
    }
    validateOrigin(root, options);
    receipt.expectedRemoteHead = remoteHead(root, options.branch);
    receipt.remoteHead = receipt.expectedRemoteHead;
    if (receipt.expectedRemoteHead) {
      git(root, ['fetch', '--no-tags', 'origin', `refs/heads/${options.branch}`]);
      if (git(root, ['rev-parse', 'FETCH_HEAD']) !== receipt.expectedRemoteHead) throw new Error('Remote moved during inspection; retry after reconciliation.');
      if (git(root, ['merge-base', '--is-ancestor', receipt.expectedRemoteHead, receipt.localHead], { allowFailure: true }) === null) throw new Error('Remote is ahead or diverged; preserve work and reconcile without force.');
    }
    const scanBase = receipt.expectedRemoteHead ?? publishedBase(root, receipt.localHead);
    receipt.scanBase = scanBase;
    receipt.unrelatedStagedFiles = git(root, ['diff', '--cached', '--name-only', '-z']).split('\0').filter((file) => file && !owned(file, options.scopes));
    const changed = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'])
      .split('\0').filter(Boolean).map((record) => record.slice(3));
    const selected = changed.filter((file) => owned(file, options.scopes));
    receipt.excludedFiles = selected.filter(excluded);
    const files = selected.filter((file) => !excluded(file));
    files.forEach((file) => validateWorktreeFile(root, file));
    assertPendingScope(root, scanBase, receipt.localHead, options.scopes);
    const env = { GIT_INDEX_FILE: temporaryIndex, GIT_LITERAL_PATHSPECS: '1' };
    git(root, ['read-tree', 'HEAD'], { env });
    // One path per command avoids Windows command-line limits and argument interpretation.
    for (const file of files) git(root, ['add', '-A', '--', file], { env });
    const staged = git(root, ['diff', '--cached', '--name-only', '-z'], { env }).split('\0').filter(Boolean);
    for (const file of staged) {
      const indexEntry = git(root, ['ls-files', '--stage', '-z', '--', file], { env });
      if (indexEntry && !indexEntry.startsWith('100644 ') && !indexEntry.startsWith('100755 ')) throw new Error(`Non-regular staged file excluded: ${file}.`);
      const content = git(root, ['show', `:${file}`], { env, binary: true, allowFailure: true });
      if (content) validateBuffer(content, file);
    }
    if (staged.length) {
      if (git(root, ['rev-parse', 'HEAD']) !== receipt.localHead || git(root, ['branch', '--show-current']) !== options.branch) throw new Error('Local HEAD or branch moved; retry after reconciliation.');
      git(root, ['commit', '-m', 'WIP: scoped recovery checkpoint'], { env });
      const priorHead = receipt.localHead;
      receipt.localHead = git(root, ['rev-parse', 'HEAD']);
      receipt.committedFiles = staged;
      if (git(root, ['branch', '--show-current']) !== options.branch || git(root, ['rev-parse', 'HEAD^']) !== priorHead) {
        throw new Error('Another Git operation changed the branch or commit parent; preserve local history and reconcile before publishing.');
      }
      // Refresh only owned paths. Other staged changes remain byte-for-byte in the real index.
      for (const file of staged) git(root, ['reset', '-q', 'HEAD', '--', file], { env: { GIT_LITERAL_PATHSPECS: '1' } });
    }
    saveReceipt();
    if (receipt.localHead !== receipt.expectedRemoteHead) {
      if (git(root, ['branch', '--show-current']) !== options.branch || git(root, ['rev-parse', 'HEAD']) !== receipt.localHead) throw new Error('Local branch or HEAD changed before push; synchronization remains pending.');
      assertPendingScope(root, scanBase, receipt.localHead, options.scopes);
      let pushed = false;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        if (remoteHead(root, options.branch) !== receipt.expectedRemoteHead) throw new Error('Remote changed since inspection; push cancelled.');
        try {
          git(root, ['push', '--porcelain', 'origin', `${receipt.localHead}:refs/heads/${options.branch}`]);
          pushed = true;
          break;
        } catch (error) {
          // A lost response can follow a successful push. Verify before retrying.
          if (remoteHead(root, options.branch) === receipt.localHead) { pushed = true; break; }
          if (attempt === 2) { error.retriesExhausted = true; throw error; }
        }
      }
      if (!pushed) throw new Error('Push remains pending.');
    }
    receipt.remoteHead = remoteHead(root, options.branch);
    if (receipt.remoteHead !== receipt.localHead) throw new Error('Remote exact-commit verification failed; synchronization is pending.');
    receipt.status = 'synchronized';
    receipt.remoteVerifiedAt = new Date().toISOString();
    receipt.completedAt = receipt.remoteVerifiedAt;
    saveReceipt();
    return { ...receipt, receiptPath };
  } catch (error) {
    receipt.status = 'pending';
    receipt.error = error.message;
    operationDeadline = Infinity; // Reading the local recovery SHA must survive a timed-out operation.
    receipt.localHead = git(root, ['rev-parse', 'HEAD'], { allowFailure: true });
    receipt.completedAt = new Date().toISOString();
    saveReceipt();
    throw error;
  } finally {
    fs.closeSync(lock);
    fs.rmSync(lockPath, { force: true });
    fs.rmSync(temporaryIndex, { force: true });
    fs.rmSync(`${temporaryIndex}.lock`, { force: true });
    operationDeadline = previousDeadline;
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  let firstFailure = null;
  let lastFailure = '';
  let repeatedFailures = 0;
  do {
    const started = Date.now();
    try {
      const receipt = checkpoint({ ...options, deadline: firstFailure === null ? undefined : firstFailure + SYNC_LIMIT_MS });
      console.log(`Checkpoint ${receipt.status}: ${receipt.localHead}; receipt ${receipt.receiptPath}`);
      firstFailure = null; lastFailure = ''; repeatedFailures = 0;
    } catch (error) {
      console.error(`Checkpoint pending: ${error.message}`);
      firstFailure ??= started;
      repeatedFailures = lastFailure === error.message ? repeatedFailures + 1 : 1;
      lastFailure = error.message;
      if (!options.watch || error.retriesExhausted || repeatedFailures >= 2 || Date.now() - firstFailure >= SYNC_LIMIT_MS) {
        process.exitCode = 1;
        return;
      }
    }
    if (options.watch) {
      const wait = Math.max(0, CADENCE_MS - (Date.now() - started));
      if (firstFailure && Date.now() + wait - firstFailure >= SYNC_LIMIT_MS) {
        console.error('Synchronization deadline reached. Caller must stop new feature work and repair backup.');
        process.exitCode = 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  } while (options.watch);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Checkpoint pending: ${error.message}`); process.exitCode = 1; });
}
