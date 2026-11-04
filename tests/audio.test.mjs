import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { assertAudioSourceIdentity, audioBackup, emptyAudioState, moveAudioEntry, parseAudioBackup, removeAudioEntry, validateAudioState } from '../src/audio/model.ts';
import { ListeningPlayer, matchingVoices, selectVoice, voiceKey } from '../src/audio/player.ts';
import { loadAudioState, saveAudioState } from '../src/audio/storage.ts';

const sourceSha256 = 'e'.repeat(64);
const ref = { bookId: 'JHN', chapter: 3, verse: 16, endVerse: 17, editionId: 'eng-web' };
const entry = { id: 'fixture-queue-1', ref, editionName: 'Fixture edition identity', language: 'en', sourceSha256, repeats: 2 };
const voice = { voiceURI: 'fixture-en-local', lang: 'en-GB', name: 'Synthetic test voice', localService: true };
const secondVoice = { voiceURI: 'fixture-de-local', lang: 'de-DE', name: 'Synthetic German test voice', localService: true };
const remoteVoice = { ...voice, voiceURI: 'fixture-en-network', localService: false };
const settings = { rate: 0.85, sleepMinutes: 0, voices: {} };
const verses = [{ number: 16, text: 'Synthetic test text one.' }, { number: 17, text: 'Synthetic test text two.' }];
const state = () => ({ ...emptyAudioState(), entries: [structuredClone(entry)], cursor: { entryId: entry.id, verse: 17, repetition: 1, completed: false }, bookmarks: [{ id: 'fixture-bookmark', ref: { ...ref, endVerse: undefined }, editionName: entry.editionName, sourceSha256, createdAt: '2026-11-04T13:00:00.000Z' }] });

test('listening backups preserve explicit edition revisions, progress, and bookmarks without extra fields', () => {
  const parsed = parseAudioBackup(audioBackup(state()));
  assert.equal(parsed.entries[0].sourceSha256, sourceSha256);
  assert.equal(parsed.bookmarks[0].ref.editionId, 'eng-web');
  assert.deepEqual(parsed.cursor, state().cursor);
  assert.equal(validateAudioState({ ...state(), accountToken: 'must not be retained' }).accountToken, undefined);
  for (const bad of [
    { ...state(), schemaVersion: 2 }, { ...state(), revision: -1 }, { ...state(), entries: [entry, entry] },
    { ...state(), entries: [{ ...entry, ref: { ...ref, editionId: undefined } }] },
    { ...state(), entries: [{ ...entry, sourceSha256: 'unverified' }] },
    { ...state(), entries: [{ ...entry, repeats: Infinity }] },
    { ...state(), cursor: { ...state().cursor, verse: 15 } },
    { ...state(), cursor: { ...state().cursor, repetition: 2 } },
    { ...state(), settings: { ...settings, voices: { constructor: 'bad' } } },
  ]) assert.throws(() => validateAudioState(bad));
  assert.throws(() => parseAudioBackup('{broken'), /valid listening JSON/);
  assert.throws(() => parseAudioBackup(JSON.stringify(state())), /not an Adigun/);
});

test('reordering retains entry-based positions and removing the current item clears only its cursor', () => {
  const second = { ...entry, id: 'fixture-2' }; const current = { ...state(), entries: [entry, second] };
  const moved = moveAudioEntry(current, entry.id, 1);
  assert.equal(moved.entries[1].id, entry.id); assert.deepEqual(moved.cursor, current.cursor);
  const removed = removeAudioEntry(moved, entry.id); assert.equal(removed.cursor, null); assert.equal(removed.bookmarks.length, 1);
  assert.equal(current.entries[0].id, entry.id);
});

test('voice selection preserves language and explicit choice instead of silently substituting voices', () => {
  assert.equal(selectVoice([remoteVoice, voice], 'en')?.voiceURI, voice.voiceURI);
  assert.equal(selectVoice([voice, secondVoice], 'yo'), undefined);
  assert.equal(selectVoice([voice, remoteVoice], 'en', 'missing'), undefined);
  assert.equal(selectVoice([voice, remoteVoice], 'en', voiceKey(remoteVoice))?.localService, false);
  assert.deepEqual(matchingVoices([voice, secondVoice], 'de-DE'), [secondVoice]);
});

test('backup language and labels cannot override the identity of the installed source', () => {
  const edition = { id: 'eng-web', name: entry.editionName, sha256: sourceSha256, language: 'en' };
  assert.doesNotThrow(() => assertAudioSourceIdentity(entry, edition));
  for (const altered of [{ ...entry, language: 'de' }, { ...entry, editionName: 'Another edition' }, { ...entry, sourceSha256: 'a'.repeat(64) }, { ...entry, ref: { ...ref, editionId: 'different-id' } }]) assert.throws(() => assertAudioSourceIdentity(altered, edition), /does not match/);
});

function playerFixture(options = {}) {
  const calls = []; const states = []; const positions = []; let cancellations = 0; let paused = false; let online = true;
  const available = options.voices || [voice, secondVoice];
  const driver = { voices: () => available, speak: (text, chosen, rate, events) => { calls.push({ text, chosen, rate, events }); events.start(); }, cancel: () => { cancellations++; }, pause: () => { paused = true; return options.pauseSupported !== false; }, resume: () => { paused = false; return true; } };
  const player = new ListeningPlayer(driver, options.load || (async () => verses), state => states.push(state), position => positions.push(position), () => online);
  return { player, calls, states, positions, available, driver, paused: () => paused, cancellations: () => cancellations, offline: () => { online = false; } };
}

test('playback reads every verse, repeats finitely, then changes language and ends', async () => {
  const fx = playerFixture(); const second = { ...entry, id: 'fixture-2', ref: { ...ref, editionId: 'deu1912' }, language: 'de', repeats: 1 };
  try {
    await fx.player.start([entry, second], settings, false);
    for (let index = 0; index < 6; index++) { assert.ok(fx.calls[index], `utterance ${index + 1}`); fx.calls[index].events.end(); await tick(); }
    assert.equal(fx.calls.length, 6);
    assert.deepEqual(fx.calls.map(call => call.text), [...verses, ...verses, ...verses].map(verse => verse.text));
    assert.deepEqual(fx.calls.map(call => call.chosen.lang), ['en-GB', 'en-GB', 'en-GB', 'en-GB', 'de-DE', 'de-DE']);
    assert.equal(fx.states.at(-1).phase, 'ended'); assert.equal(fx.positions.at(-1).completed, true);
  } finally { fx.player.dispose(); }
});

test('saved progress resumes at the exact unfinished source verse and repetition', async () => {
  const fx = playerFixture();
  try { await fx.player.start([entry], settings, false, state().cursor); assert.equal(fx.calls[0].text, verses[1].text); fx.calls[0].events.end(); await tick(); assert.equal(fx.calls.length, 1); assert.equal(fx.states.at(-1).phase, 'ended'); }
  finally { fx.player.dispose(); }
});

test('stop cancels pending source loads and stale utterance events cannot resume or skip passages', async () => {
  let resolve; const pending = new Promise(done => { resolve = done; }); const fx = playerFixture({ load: () => pending });
  try { const start = fx.player.start([entry], settings, false); fx.player.stop(); resolve(verses); await start; assert.equal(fx.calls.length, 0); }
  finally { fx.player.dispose(); }
  const second = playerFixture();
  try {
    await second.player.start([entry], settings, false); const old = second.calls[0]; old.events.end(); assert.equal(second.calls.length, 2);
    old.events.end(); old.events.error(); assert.equal(second.calls.length, 2); assert.equal(second.states.at(-1).phase, 'playing');
    second.player.stop(); old.events.start(); second.calls[1].events.end(); assert.equal(second.states.at(-1).phase, 'stopped'); assert.equal(second.calls.length, 2);
  } finally { second.player.dispose(); }
});

test('unavailable languages, revoked source permission, and network consent block playback', async () => {
  for (const [options, queue, network, pattern] of [
    [{ voices: [voice] }, [{ ...entry, language: 'yo' }], false, /No selected matching yo voice/],
    [{ voices: [remoteVoice] }, [entry], false, /Allow network-voice/],
    [{ load: async () => { throw new Error('Permission revoked for this source revision.'); } }, [entry], true, /Permission revoked/],
  ]) {
    const fx = playerFixture(options);
    try { await fx.player.start(queue, settings, network); assert.equal(fx.calls.length, 0); assert.equal(fx.states.at(-1).phase, 'error'); assert.match(fx.states.at(-1).message, pattern); }
    finally { fx.player.dispose(); }
  }
  const fx = playerFixture({ voices: [remoteVoice] });
  try { await fx.player.start([entry], settings, true); fx.offline(); fx.player.connectionChanged(); assert.equal(fx.states.at(-1).phase, 'stopped'); fx.calls[0].events.end(); assert.equal(fx.calls.length, 1); }
  finally { fx.player.dispose(); }
});

test('sleep expiry cancels pending playback, while unsupported pause stops safely', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 }); const fx = playerFixture();
  try { await fx.player.start([entry], { ...settings, sleepMinutes: 5 }, false); fx.player.pause(); assert.equal(fx.states.at(-1).phase, 'paused'); fx.player.resume(); assert.equal(fx.states.at(-1).phase, 'playing'); context.mock.timers.tick(300_000); assert.equal(fx.states.at(-1).phase, 'stopped'); assert.match(fx.states.at(-1).message, /Sleep timer finished/); fx.calls[0].events.end(); assert.equal(fx.calls.length, 1); }
  finally { fx.player.dispose(); context.mock.timers.reset(); }
  const unsupported = playerFixture({ pauseSupported: false });
  try { await unsupported.player.start([entry], settings, false); unsupported.player.pause(); assert.equal(unsupported.states.at(-1).phase, 'stopped'); assert.match(unsupported.states.at(-1).message, /did not confirm pause/); }
  finally { unsupported.player.dispose(); }
});

function storageFixture(initial) {
  let stored = initial; const requests = []; let active; const flags = { failWrite: false, hold: false };
  const db = { objectStoreNames: { contains: () => true }, createObjectStore() {}, close() {}, transaction() {
    const tx = { aborted: false, next: undefined, read: undefined, objectStore: () => ({
      get() { const read = {}; tx.read = read; requests.push(tx); queueMicrotask(pump); return read; },
      put(value) { tx.next = structuredClone(value); if (flags.failWrite) queueMicrotask(() => { tx.onerror?.(); tx.abort(); }); },
    }), abort() { if (tx.aborted) return; tx.aborted = true; queueMicrotask(() => { tx.onabort?.(); if (active === tx) { active = undefined; pump(); } }); } }; return tx;
  } };
  function finish() { const tx = active; if (!tx || tx.aborted) return; if (tx.next !== undefined) stored = tx.next; tx.oncomplete?.(); active = undefined; pump(); }
  function pump() { if (active || !requests.length) return; const tx = active = requests.shift(); queueMicrotask(() => { tx.read.result = stored; tx.read.onsuccess?.(); if (!tx.aborted && !(flags.hold && tx.next)) queueMicrotask(finish); }); }
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open(name) { assert.equal(name, 'adigun-aibible-audio'); const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess?.(); }); return request; } } });
  return { flags, finish, stored: () => stored, dispose: () => { db.onversionchange?.(); delete globalThis.indexedDB; } };
}

test('listening writes resolve at transaction commit and concurrent stale saves preserve prior data', async () => {
  const fx = storageFixture();
  try {
    assert.deepEqual(await loadAudioState(), emptyAudioState()); fx.flags.hold = true; let resolved = false;
    const first = saveAudioState(state(), 0).then(value => { resolved = true; return value; }); await tick(); assert.equal(resolved, false); assert.equal(fx.stored(), undefined);
    fx.flags.hold = false; fx.finish(); const saved = await first; assert.equal(saved.revision, 1);
    await assert.rejects(saveAudioState(emptyAudioState(), 0), /Another tab/); assert.equal((await loadAudioState()).entries.length, 1);
    fx.flags.failWrite = true; await assert.rejects(saveAudioState({ ...saved, entries: [], cursor: null }, 1), /not saved/); assert.equal((await loadAudioState()).entries.length, 1);
  } finally { fx.dispose(); }
});

test('corrupt listening data is rejected without silently replacing it with an empty queue', async () => {
  const corrupt = { ...state(), schemaVersion: 99 }; const fx = storageFixture(corrupt);
  try { await assert.rejects(loadAudioState(), /Unsupported/); await assert.rejects(saveAudioState(emptyAudioState(), 0), /Unsupported/); assert.deepEqual(fx.stored(), corrupt); }
  finally { fx.dispose(); }
});
