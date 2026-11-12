import test from 'node:test';
import assert from 'node:assert/strict';
import { IncomingTransfer, digest, encodeChunks, parseMessage, parseSignal, participantName, shareReference, validatePayload, verificationCode } from '../src/nearby/protocol.ts';

const now = 1_000_000;
const signal = (role = 'host') => ({ kind: 'adigun-nearby-signal', version: 1, roomId: '12345678-1234-4321-8123-123456789abc', linkId: '87654321-4321-4123-8123-987654321abc', role, name: role === 'host' ? 'Host' : 'Guest', expiresAt: now + 600_000, description: { type: role === 'host' ? 'offer' : 'answer', sdp: `v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 ${role === 'host' ? 'AA:BB' : 'CC:DD'}\r\na=candidate:1 1 udp 1 192.168.1.1 4000 typ host\r\n` } });

test('pairing rejects expired, oversized, mixed-media and relay offers', () => {
  assert.equal(parseSignal(JSON.stringify(signal()), now).name, 'Host');
  assert.throws(() => parseSignal(JSON.stringify({ ...signal(), expiresAt: now }), now), /expired/);
  assert.throws(() => parseSignal(' '.repeat(80_001), now), /too large/);
  for (const sdp of [signal().description.sdp + 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', signal().description.sdp.replace('typ host', 'typ relay')]) assert.throws(() => parseSignal(JSON.stringify({ ...signal(), description: { type: 'offer', sdp } }), now), /data-only|host-network/);
  assert.throws(() => parseSignal(JSON.stringify({ ...signal(), telemetryUrl: 'https://example.org' }), now), /invalid/);
  assert.throws(() => participantName('Hidden\nname'), /display name/);
});

test('verification code binds both certificate fingerprints and room identity', async () => {
  const host = signal(), guest = signal('guest');
  const code = await verificationCode(host, guest);
  assert.match(code, /^[A-F0-9]{4}( [A-F0-9]{4}){3}$/);
  const changed = structuredClone(guest); changed.description.sdp = changed.description.sdp.replace('CC:DD', 'EE:FF');
  assert.notEqual(await verificationCode(host, changed), code);
  await assert.rejects(verificationCode(host, { ...guest, roomId: crypto.randomUUID() }), /belong together/);
});

test('references exclude private edition preferences and unknown message fields', () => {
  assert.deepEqual(shareReference({ bookId: 'GEN', chapter: 1, verse: 1, endVerse: 2, editionId: 'eng-web' }), { bookId: 'GEN', chapter: 1, verse: 1, endVerse: 2 });
  assert.throws(() => validatePayload({ type: 'annotation', text: 'Note', reference: { bookId: 'GEN', chapter: 1, verse: 1, privateNotes: 'Never shared' } }), /reference/);
  assert.throws(() => validatePayload({ type: 'chat', text: 'Note', privateHistory: [] }), /invalid/);
  assert.throws(() => parseMessage(JSON.stringify({ version: 1, roomId: 'different', sequence: 2, payload: { type: 'ready' } }), signal().roomId, 1), /duplicate|out-of-order/);
  assert.throws(() => validatePayload({ type: 'reference', reference: { bookId: 'GEN', chapter: 1, verse: 1, endVerse: 41 } }), /reference/);
});

test('shared detective mission messages enforce the known mission and bounded clue sequence', () => {
  assert.deepEqual(validatePayload({ type: 'mission-state', missionId: 'good-samaritan-evidence', nextClueIndex: 0, status: 'active' }), { type: 'mission-state', missionId: 'good-samaritan-evidence', nextClueIndex: 0, status: 'active' });
  assert.deepEqual(validatePayload({ type: 'mission-state', missionId: 'good-samaritan-evidence', nextClueIndex: 5, status: 'complete' }), { type: 'mission-state', missionId: 'good-samaritan-evidence', nextClueIndex: 5, status: 'complete' });
  assert.deepEqual(validatePayload({ type: 'mission-answer', missionId: 'good-samaritan-evidence', clueIndex: 0, clueId: 'questioner', answerId: 'lawyer' }), { type: 'mission-answer', missionId: 'good-samaritan-evidence', clueIndex: 0, clueId: 'questioner', answerId: 'lawyer' });
  assert.deepEqual(validatePayload({ type: 'mission-result', missionId: 'good-samaritan-evidence', clueIndex: 0, clueId: 'questioner', answerId: 'lawyer', correct: true }), { type: 'mission-result', missionId: 'good-samaritan-evidence', clueIndex: 0, clueId: 'questioner', answerId: 'lawyer', correct: true });
  assert.throws(() => validatePayload({ type: 'mission-state', missionId: 'invented-mission', nextClueIndex: 0, status: 'active' }), /mission state/);
  assert.throws(() => validatePayload({ type: 'mission-state', missionId: 'good-samaritan-evidence', nextClueIndex: 5, status: 'active' }), /mission state/);
  assert.throws(() => validatePayload({ type: 'mission-answer', missionId: 'good-samaritan-evidence', clueIndex: 5, clueId: 'questioner', answerId: 'lawyer' }), /mission answer/);
  assert.throws(() => validatePayload({ type: 'mission-answer', missionId: 'good-samaritan-evidence', clueIndex: 0, clueId: 'questioner', answerId: 'lawyer', privateNotes: 'not shared' }), /invalid/);
});

test('multi-chunk receipt verifies exact byte count, ordering and SHA before returning content', async () => {
  const bytes = new TextEncoder().encode('Yorùbá · Ελληνικά · עברית\n'.repeat(800));
  const chunks = encodeChunks(bytes), transferId = crypto.randomUUID();
  const offer = { type: 'pack-offer', transferId, title: 'Attributed passage', bytes: bytes.length, sha256: await digest(bytes), chunks: chunks.length };
  const transfer = new IncomingTransfer(offer);
  for (let index = 0; index < chunks.length; index++) {
    const result = await transfer.add({ type: 'pack-chunk', transferId, index, data: chunks[index] });
    if (index === chunks.length - 1) assert.deepEqual(result, bytes); else assert.equal(result, null);
  }
  const reordered = new IncomingTransfer(offer);
  await assert.rejects(reordered.add({ type: 'pack-chunk', transferId, index: 1, data: chunks[1] }), /order/);
  const badHash = new IncomingTransfer({ ...offer, sha256: '0'.repeat(64) });
  for (let index = 0; index < chunks.length - 1; index++) await badHash.add({ type: 'pack-chunk', transferId, index, data: chunks[index] });
  await assert.rejects(badHash.add({ type: 'pack-chunk', transferId, index: chunks.length - 1, data: chunks.at(-1) }), /checksum/);
  assert.throws(() => encodeChunks(new Uint8Array(250_001)), /250 KB/);
});

