import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseOptions } from '../scripts/checkpoint.mjs';

const script = fileURLToPath(new URL('../scripts/checkpoint.mjs', import.meta.url));
const branch = 'codex/checkpoint-test';

function run(cwd, command, args, acceptable = [0]) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(cwd, 'absent-global-config') };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 30_000,
    env,
  });
  assert.ok(!result.error, result.error?.message);
  assert.ok(acceptable.includes(result.status), `${command} ${args.join(' ')} exited ${result.status}: ${result.stderr}`);
  return result;
}

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bible-checkpoint-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'work');
  const remote = path.join(temp, 'remote.git');
  fs.mkdirSync(root);
  const git = (...args) => run(root, 'git', args).stdout.trimEnd();
  run(temp, 'git', ['init', '--bare', '--initial-branch=main', remote]);
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Isolated checkpoint test');
  git('config', 'user.email', 'checkpoint-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', path.join(temp, 'no-hooks'));
  fs.writeFileSync(path.join(root, 'README.md'), 'Fixture repository\n');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'existing.txt'), 'before\n');
  git('add', '.');
  git('commit', '-m', 'Fixture baseline');
  git('remote', 'add', 'origin', remote);
  git('push', 'origin', 'main');
  git('switch', '-c', branch);
  git('push', '-u', 'origin', branch);
  const check = (extra = [], acceptable = [0]) => run(root, process.execPath, [
    script, '--once', '--branch', branch, '--scope', 'src', '--testing-allow-local', ...extra,
  ], acceptable);
  const receipt = () => JSON.parse(fs.readFileSync(path.join(root, '.git', 'checkpoint-state.json'), 'utf8'));
  return { temp, root, remote, git, check, receipt };
}

test('commits new and tracked owned files, verifies exact remote, and preserves unrelated staged changes', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'src', 'existing.txt'), 'after\n');
  fs.writeFileSync(path.join(f.root, 'src', 'new.txt'), 'new work\n');
  fs.writeFileSync(path.join(f.root, 'README.md'), 'Human staged revision\n');
  f.git('add', 'README.md');
  const stagedBefore = f.git('show', ':README.md');
  f.check();
  const head = f.git('rev-parse', 'HEAD');
  assert.equal(f.git('ls-remote', 'origin', `refs/heads/${branch}`).split('\t')[0], head);
  assert.equal(f.git('show', 'HEAD:src/new.txt'), 'new work');
  assert.equal(f.git('show', 'HEAD:src/existing.txt'), 'after');
  assert.equal(f.git('show', ':README.md'), stagedBefore);
  assert.equal(f.git('show', 'HEAD:README.md'), 'Fixture repository');
  assert.equal(f.git('diff', '--cached', '--name-only'), 'README.md');
  assert.equal(f.receipt().status, 'synchronized');
  assert.equal(f.receipt().localHead, head);
  assert.equal(f.receipt().remoteHead, head);
  assert.deepEqual(f.receipt().unrelatedStagedFiles, ['README.md']);
  assert.equal(f.git('ls-files', '.git/checkpoint-state.json'), '');
});

test('unchanged work makes no empty commit', (t) => {
  const f = fixture(t);
  const head = f.git('rev-parse', 'HEAD');
  f.check();
  f.check();
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.deepEqual(f.receipt().committedFiles, []);
  assert.equal(f.receipt().status, 'synchronized');
});

test('potential secret is rejected before commit or push', (t) => {
  const f = fixture(t);
  const before = f.git('rev-parse', 'HEAD');
  const secret = 'ghp_' + 'A'.repeat(30);
  fs.writeFileSync(path.join(f.root, 'src', 'credentials.txt'), `${secret}\n`);
  const result = f.check([], [1]);
  assert.match(result.stderr, /Potential secret/);
  assert.ok(!result.stderr.includes(secret));
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(f.receipt().status, 'pending');
  assert.ok(fs.existsSync(path.join(f.root, 'src', 'credentials.txt')));
});

test('failing application tests do not prevent a scoped WIP backup', (t) => {
  const f = fixture(t);
  const failing = path.join(f.root, 'src', 'app.test.mjs');
  fs.writeFileSync(failing, "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('unfinished feature', () => assert.equal(1, 2));\n");
  run(f.root, process.execPath, ['--test', failing], [1]);
  f.check();
  assert.equal(f.receipt().status, 'synchronized');
  assert.match(f.receipt().applicationTests, /NOT RUN/);
  assert.equal(f.git('show', 'HEAD:src/app.test.mjs').includes('unfinished feature'), true);
});

test('rejected pushes preserve the local commit, work and pending receipt; retry recovers without another commit', (t) => {
  const f = fixture(t);
  const hook = path.join(f.remote, 'hooks', 'pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const before = f.git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.root, 'src', 'pending.txt'), 'work survives\n');
  f.check([], [1]);
  const saved = f.git('rev-parse', 'HEAD');
  assert.notEqual(saved, before);
  assert.equal(f.git('ls-remote', 'origin', `refs/heads/${branch}`).split('\t')[0], before);
  assert.equal(f.receipt().status, 'pending');
  assert.equal(f.receipt().localHead, saved);
  assert.equal(f.receipt().remoteVerifiedAt, null);
  assert.equal(fs.readFileSync(path.join(f.root, 'src', 'pending.txt'), 'utf8'), 'work survives\n');
  fs.rmSync(hook);
  f.check();
  assert.equal(f.git('rev-parse', 'HEAD'), saved);
  assert.equal(f.receipt().status, 'synchronized');
});

test('unauthorized current branch is rejected', (t) => {
  const f = fixture(t);
  f.git('switch', 'main');
  fs.writeFileSync(path.join(f.root, 'src', 'existing.txt'), 'must remain local\n');
  f.check([], [1]);
  assert.equal(f.receipt().status, 'pending');
  assert.equal(f.receipt().branch, 'main');
  assert.throws(() => parseOptions(['--branch', 'main', '--scope', 'src']), /task branch/);
});

test('an existing lock prevents operations without altering its owner or previous receipt', (t) => {
  const f = fixture(t);
  const lock = path.join(f.root, '.git', 'checkpoint.lock');
  fs.writeFileSync(lock, 'existing owner');
  const before = f.git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.root, 'src', 'existing.txt'), 'pending\n');
  const result = f.check([], [1]);
  assert.match(result.stderr, /lock/);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'existing owner');
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(fs.existsSync(path.join(f.root, '.git', 'checkpoint-state.json')), false);
});

test('local origin requires the explicit testing flag', (t) => {
  const f = fixture(t);
  const result = run(f.root, process.execPath, [script, '--branch', branch, '--scope', 'src'], [1]);
  assert.match(result.stderr, /Local remotes require/);
  assert.equal(f.receipt().status, 'pending');
});

test('large files and unowned unpublished commits cannot be pushed', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'src', 'too-large.txt'), 'x'.repeat(2 * 1024 * 1024 + 1));
  f.check([], [1]);
  assert.match(f.receipt().error, /Oversized/);
  fs.rmSync(path.join(f.root, 'src', 'too-large.txt'));
  fs.writeFileSync(path.join(f.root, 'README.md'), 'Unowned unpublished work\n');
  f.git('add', 'README.md');
  f.git('commit', '-m', 'Unrelated local commit');
  f.check([], [1]);
  assert.match(f.receipt().error, /unowned/);
});

test('environment files are excluded without hiding their pending state', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'src', '.env'), 'LOCAL_ONLY=example\n');
  f.check();
  assert.deepEqual(f.receipt().excludedFiles, ['src/.env']);
  assert.equal(f.git('ls-files', 'src/.env'), '');
  assert.ok(fs.existsSync(path.join(f.root, 'src', '.env')));
});

test('a new authorized branch can publish only its owned changes above established remote history', (t) => {
  const f = fixture(t);
  const nextBranch = 'codex/new-task';
  f.git('switch', '-c', nextBranch);
  fs.writeFileSync(path.join(f.root, 'src', 'first.txt'), 'first useful change\n');
  f.check(['--branch', nextBranch]);
  assert.equal(f.receipt().status, 'synchronized');
  assert.equal(f.receipt().expectedRemoteHead, null);
  assert.ok(f.receipt().scanBase);
  assert.equal(f.git('ls-remote', 'origin', `refs/heads/${nextBranch}`).split('\t')[0], f.git('rev-parse', 'HEAD'));
});

test('remote advancement is preserved and an outdated local branch cannot overwrite it', (t) => {
  const f = fixture(t);
  const peer = path.join(f.temp, 'peer');
  run(f.temp, 'git', ['clone', '--branch', branch, f.remote, peer]);
  run(peer, 'git', ['config', 'user.name', 'Other worker']);
  run(peer, 'git', ['config', 'user.email', 'peer@example.invalid']);
  run(peer, 'git', ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(peer, 'src', 'peer.txt'), 'preserve another worker\n');
  run(peer, 'git', ['add', 'src/peer.txt']);
  run(peer, 'git', ['commit', '-m', 'Other worker commit']);
  run(peer, 'git', ['push', 'origin', branch]);
  const remoteBefore = f.git('ls-remote', 'origin', `refs/heads/${branch}`);
  const localBefore = f.git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.root, 'src', 'local.txt'), 'local work preserved\n');
  f.check([], [1]);
  assert.match(f.receipt().error, /ahead or diverged/);
  assert.equal(f.git('rev-parse', 'HEAD'), localBefore);
  assert.equal(f.git('ls-remote', 'origin', `refs/heads/${branch}`), remoteBefore);
  assert.equal(fs.readFileSync(path.join(f.root, 'src', 'local.txt'), 'utf8'), 'local work preserved\n');
});

test('a broken symlink is rejected before commit', (t) => {
  const f = fixture(t);
  const link = path.join(f.root, 'src', 'broken-link');
  try { fs.symlinkSync('missing-target', link, 'file'); }
  catch (error) {
    if (error.code === 'EPERM') { t.skip('Host does not permit symlink creation.'); return; }
    throw error;
  }
  const before = f.git('rev-parse', 'HEAD');
  f.check([], [1]);
  assert.match(f.receipt().error, /Symlink/);
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
});
