import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { packSourceJsonBytes } from '../scripts/pack-source-json.mjs';
import { decodeSourceJsonBytes, readBoundedJson, readSourceBytes, readSourceJson, SOURCE_BASE64_MAX_CHARS, SOURCE_JSON_MAX_BYTES } from '../src/source-codec.ts';

const raw = Buffer.from(JSON.stringify({ id: 'ACT', name: 'Àwọn Ìṣe', chapters: [{ number: 17, verses: [{ number: 16, text: 'Àpẹẹrẹ ẹ̀rí [fún ìdánwò] — <source> & é.' }] }] }));
const envelope = () => JSON.parse(packSourceJsonBytes(raw));
const decode = value => readSourceJson(Response.json(value));
function manual(bytes) { return { kind: 'adigun.source-envelope', version: 1, encoding: 'gzip-base64', decodedBytes: bytes.length, decodedSha256: createHash('sha256').update(bytes).digest('hex'), payload: gzipSync(bytes).toString('base64') }; }

test('raw and deterministic envelope sources retain exact Unicode, annotations, and canonical hashes', async () => {
  for (const path of ['../data/editions/yor/books/ACT.json', '../data/editions/eng-bsb/books/ACT.json']) {
    const bytes = await readFile(new URL(path, import.meta.url)), packed = packSourceJsonBytes(bytes);
    assert.deepEqual(packed, packSourceJsonBytes(bytes));
    assert.deepEqual(await decodeSourceJsonBytes(packed), JSON.parse(bytes));
    assert.deepEqual(await readSourceJson(new Response(bytes)), JSON.parse(bytes));
    const record = JSON.parse(packed);
    assert.equal(record.decodedBytes, bytes.length);
    assert.equal(record.decodedSha256, createHash('sha256').update(bytes).digest('hex'));
  }
  assert.deepEqual(await decodeSourceJsonBytes(packSourceJsonBytes(Buffer.from('[{"text":"é"}]'))), [{ text: 'é' }]);
});

test('malformed raw data and envelope variants fail instead of falling back to another representation', async () => {
  for (const text of ['null', 'true', '"text"', '{broken']) await assert.rejects(readSourceJson(new Response(text)), /JSON/);
  await assert.rejects(readSourceJson(new Response(new Uint8Array([0xc3, 0x28]))), /UTF-8/);
  await assert.rejects(readSourceJson(new Response('{}', { status: 503 })), /unavailable/);
  for (const change of [{ version: 2 }, { kind: 'wrong' }, { encoding: 'br' }, { decodedBytes: 0 }, { decodedBytes: 1.5 }, { decodedBytes: SOURCE_JSON_MAX_BYTES + 1 }, { decodedSha256: 'bad' }, { payload: null }, { extra: true }]) await assert.rejects(decode({ ...envelope(), ...change }), /invalid or unsupported/);
  const missing = envelope(); delete missing.version;
  await assert.rejects(decode(missing), /invalid or unsupported/);
  for (const payload of ['!', 'abc', 'A=A=', 'AB==', 'AAA===', envelope().payload + '\n']) await assert.rejects(decode({ ...envelope(), payload }), /base64|byte limit/);
});

test('declared length, checksum, gzip integrity, expansion ratio, and nesting are enforced', async () => {
  await assert.rejects(decode({ ...envelope(), decodedBytes: raw.length - 1 }), /byte limit/);
  await assert.rejects(decode({ ...envelope(), decodedBytes: raw.length + 1 }), /byte count/);
  await assert.rejects(decode({ ...envelope(), decodedSha256: '0'.repeat(64) }), /checksum/);
  const compressed = Buffer.from(envelope().payload, 'base64');
  await assert.rejects(decode({ ...envelope(), payload: compressed.subarray(0, compressed.length - 4).toString('base64') }), /could not be decoded/);
  await assert.rejects(decode({ ...envelope(), decodedBytes: 1_000_000 }), /expansion ratio/);
  const nested = manual(Buffer.from(JSON.stringify(envelope())));
  await assert.rejects(decode(nested), /Nested/);
  const bomb = manual(Buffer.from('x'.repeat(1_000_000))); bomb.decodedBytes = 1;
  await assert.rejects(decode(bomb), /byte limit/, 'actual output is bounded even when the declared size lies');
});

test('oversized base64 strings are rejected before decompression', async () => {
  await assert.rejects(decode({ ...envelope(), payload: 'A'.repeat(SOURCE_BASE64_MAX_CHARS + 4) }), /invalid base64/);
});

test('raw stream limits are enforced before parsing, including tiny chunks and dishonest lengths', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"tooLong":true}')); }, cancel() { cancelled = true; } }), { headers: { 'Content-Length': '1' } });
  await assert.rejects(readBoundedJson(response, 8), /byte limit/);
  assert.equal(cancelled, true);
  const text = new TextEncoder().encode('{"ok":true}');
  const tiny = new Response(new ReadableStream({ start(controller) { for (const byte of text) controller.enqueue(new Uint8Array([byte])); controller.close(); } }));
  assert.deepEqual(await readBoundedJson(tiny, text.length), { ok: true });
  await assert.rejects(readBoundedJson(new Response('{}'), Infinity), /Invalid source JSON byte limit/);
});

test('missing browser decompression is explicit while raw development JSON remains readable', async () => {
  const original = globalThis.DecompressionStream;
  globalThis.DecompressionStream = undefined;
  try {
    await assert.rejects(decode(envelope()), /browser cannot decompress scripture/);
    assert.deepEqual(await readSourceJson(new Response(raw)), JSON.parse(raw));
  } finally { globalThis.DecompressionStream = original; }
});

test('aborting an already verified input or an in-flight body never returns a late decoded source', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(decodeSourceJsonBytes(packSourceJsonBytes(raw), controller.signal), { name: 'AbortError' });
  let cancelledBeforeRead = false;
  const lateResponse = new Response(new ReadableStream({ cancel() { cancelledBeforeRead = true; } }));
  await assert.rejects(readSourceBytes(lateResponse, 8, controller.signal), { name: 'AbortError' });
  assert.equal(cancelledBeforeRead, true); assert.equal(lateResponse.body.locked, false);
  const active = new AbortController(); let cancelled = false;
  const response = new Response(new ReadableStream({ start() {}, cancel() { cancelled = true; } }));
  const reading = readSourceJson(response, active.signal);
  active.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  assert.equal(cancelled, true);
});

test('oversized cloned response rejects and releases its reader without waiting for the unread sibling', async () => {
  const original = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9)); } }));
  const clone = original.clone(), reading = readSourceBytes(clone, 8); let timer;
  const settled = reading.then(() => ({ kind: 'resolved' }), error => ({ kind: 'rejected', error }));
  try {
    const result = await Promise.race([settled, new Promise(resolve => { timer = setTimeout(() => resolve({ kind: 'timeout' }), 1000); })]);
    assert.equal(result.kind, 'rejected', 'size rejection must not wait for an unrelated stream consumer');
    assert.match(result.error.message, /byte limit/); assert.equal(clone.body.locked, false);
    const sibling = original.body.getReader();
    try { assert.equal((await sibling.read()).value.length, 9, 'rejecting one branch must not consume the sibling'); }
    finally { void sibling.cancel().catch(() => undefined); sibling.releaseLock(); }
  } finally { clearTimeout(timer); if (!original.body.locked) void original.body.cancel().catch(() => undefined); await settled; }
});

test('aborting a cloned pending response releases its reader without awaiting the untouched sibling', async () => {
  const original = new Response(new ReadableStream({ start() {} })), clone = original.clone(), controller = new AbortController();
  const reading = readSourceBytes(clone, 8, controller.signal); let timer; controller.abort();
  const settled = reading.then(() => ({ kind: 'resolved' }), error => ({ kind: 'rejected', error }));
  try {
    const result = await Promise.race([settled, new Promise(resolve => { timer = setTimeout(() => resolve({ kind: 'timeout' }), 1000); })]);
    assert.equal(result.kind, 'rejected'); assert.equal(result.error.name, 'AbortError'); assert.equal(clone.body.locked, false);
  } finally { clearTimeout(timer); void original.body.cancel().catch(() => undefined); await settled; }
});

test('zero-byte file caps accept empty bodies and reject the first supplied byte', async () => {
  assert.equal((await readSourceBytes(new Response(null), 0)).byteLength, 0);
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } }));
  await assert.rejects(readSourceBytes(response, 0), /byte limit/); assert.equal(cancelled, true);
});
