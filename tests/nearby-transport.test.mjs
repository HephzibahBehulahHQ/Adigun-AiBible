import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { NearbyLink } from '../src/nearby/transport.ts';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Channel extends EventTarget {
  label = 'adigun-study-v1'; readyState = 'connecting'; bufferedAmount = 0; sent = []; peer;
  send(raw) { if (this.readyState !== 'open') throw new Error('Closed channel'); this.sent.push(JSON.parse(raw)); queueMicrotask(() => { if (this.peer?.readyState === 'open') this.peer.onmessage?.({ data: raw }); }); }
  open() { this.readyState = 'open'; this.onopen?.(); }
  close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.dispatchEvent(new Event('close')); this.onclose?.(); this.peer?.close(); }
  receive(message) { this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) }); }
}
class Peer extends EventTarget {
  static peers = [];
  id; channel; localDescription; remoteDescription; connectionState = 'new'; iceGatheringState = 'complete'; gate;
  constructor(configuration) { super(); this.configuration = configuration; this.id = Peer.peers.push(this) - 1; }
  description(type) { return { type, sdp: `v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 ${this.id % 2 ? 'BB' : 'AA'}:CC:DD\r\na=x-test-peer:${this.id}\r\na=candidate:1 1 udp 1 192.168.1.1 4000 typ host\r\n` }; }
  createDataChannel() { this.channel = new Channel(); return this.channel; }
  async createOffer() { if (this.gate) await this.gate.promise; return this.description('offer'); }
  async createAnswer() { return this.description('answer'); }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    if (description.type !== 'answer') return;
    const other = Peer.peers[Number(description.sdp.match(/a=x-test-peer:(\d+)/)[1])];
    const guest = new Channel(); other.channel = guest;
    guest.peer = this.channel; this.channel.peer = guest;
    other.ondatachannel?.({ channel: guest });
    this.connectionState = other.connectionState = 'connected';
    this.onconnectionstatechange?.(); other.onconnectionstatechange?.();
    this.channel.open(); guest.open();
  }
  close() { this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
}
const originals = { rtc: Object.getOwnPropertyDescriptor(globalThis, 'RTCPeerConnection'), secure: Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext') };
before(() => { Object.defineProperty(globalThis, 'RTCPeerConnection', { value: Peer, configurable: true, writable: true }); Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true, writable: true }); });
after(() => { for (const [key, descriptor] of [['RTCPeerConnection', originals.rtc], ['isSecureContext', originals.secure]]) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
const events = (handler = () => {}) => {
  const result = { statuses: [], codes: [], messages: [], errors: [], closedCount: 0 };
  result.callbacks = { status: value => result.statuses.push(value), code: value => result.codes.push(value), message: async value => { result.messages.push(value); await handler(value); }, error: value => result.errors.push(value), closed: () => result.closedCount++ };
  return result;
};
async function pair(t, onHost, onGuest, approved = true) {
  const hostEvents = events(onHost), guestEvents = events(onGuest);
  const host = new NearbyLink('host', 'Host', hostEvents.callbacks), hostPeer = Peer.peers.at(-1);
  const guest = new NearbyLink('guest', 'Guest', guestEvents.callbacks), guestPeer = Peer.peers.at(-1);
  t.after(() => { host.close(); guest.close(); });
  const offer = await host.createOffer(), answer = await guest.answerOffer(offer);
  await host.acceptAnswer(answer);
  if (approved) { host.approve(); guest.approve(); await flush(); }
  return { host, guest, hostEvents, guestEvents, hostPeer, guestPeer, offer, answer };
}

test('manual pairing has matching verification, explicit mutual approval and host-only navigation', async t => {
  const { host, guest, hostEvents, guestEvents, hostPeer } = await pair(t, undefined, undefined, false);
  assert.equal(hostEvents.codes[0], guestEvents.codes[0]); assert.equal(host.connected, true); assert.equal(host.approved, false);
  assert.deepEqual(hostPeer.configuration.iceServers, []);
  assert.throws(() => host.send({ type: 'chat', text: 'not approved' }), /Both participants/);
  host.approve(); await flush(); assert.equal(guest.approved, false);
  guest.approve(); await flush(); assert.equal(host.approved, true); assert.equal(guest.approved, true);
  const reference = { bookId: 'JHN', chapter: 3, verse: 16 };
  host.send({ type: 'reference', reference }); guest.send({ type: 'annotation', reference, text: 'My explicitly shared note' }); await flush();
  assert.deepEqual(guestEvents.messages.at(-1), { type: 'reference', reference });
  assert.equal(hostEvents.messages.at(-1).text, 'My explicitly shared note');
  assert.throws(() => guest.send({ type: 'reference', reference }), /Only the host/);
});

test('cancel control overtakes a pending transfer callback without blocking the room', async t => {
  const pending = deferred(), handled = [];
  const { guest, host, hostEvents } = await pair(t, async payload => { handled.push(payload.type); if (payload.type === 'pack-accept') await pending.promise; });
  const transferId = crypto.randomUUID();
  guest.send({ type: 'pack-accept', transferId }); await flush();
  guest.send({ type: 'pack-cancel', transferId }); await flush();
  assert.deepEqual(handled.slice(-2), ['pack-accept', 'pack-cancel']);
  pending.resolve(); await flush();
  guest.send({ type: 'chat', text: 'Still connected after cancel' }); await flush();
  assert.equal(hostEvents.messages.at(-1).text, 'Still connected after cancel'); assert.equal(host.connected, true);
});

test('leave closes immediately while a slow callback is pending and discards queued writing', async t => {
  const pending = deferred();
  const { host, guest, hostEvents } = await pair(t, async payload => { if (payload.type === 'pack-accept') await pending.promise; });
  guest.send({ type: 'pack-accept', transferId: crypto.randomUUID() }); await flush();
  guest.send({ type: 'chat', text: 'Queued while sending' }); guest.send({ type: 'leave' }); await flush();
  assert.equal(host.connected, false); assert.equal(hostEvents.closedCount, 1);
  pending.resolve(); await flush();
  assert.ok(!hostEvents.messages.some(payload => payload.text === 'Queued while sending'));
});

test('cancelling during a backpressure notification sends no additional chunk and preserves the connection', async t => {
  const { host, hostPeer, guestEvents } = await pair(t);
  const controller = new AbortController(); hostPeer.channel.bufferedAmount = 90_000;
  const sending = host.sendChunks(crypto.randomUUID(), ['YWJj'], controller.signal, () => assert.fail('Cancelled chunk must not report progress'));
  hostPeer.channel.bufferedAmount = 0; hostPeer.channel.dispatchEvent(new Event('bufferedamountlow')); controller.abort();
  await assert.rejects(sending, /cancelled/);
  assert.equal(hostPeer.channel.sent.filter(row => row.payload.type === 'pack-chunk').length, 0); assert.equal(host.connected, true);
  host.send({ type: 'chat', text: 'Transfer cancelled, discussion continues' }); await flush();
  assert.equal(guestEvents.messages.at(-1).text, 'Transfer cancelled, discussion continues');
});

test('closing releases a blocked buffer wait immediately and notifies closure only once', async t => {
  const { host, hostPeer, hostEvents } = await pair(t);
  hostPeer.channel.bufferedAmount = 90_000;
  const sending = host.sendChunks(crypto.randomUUID(), ['YWJj'], new AbortController().signal, () => assert.fail('Closed link cannot report progress'));
  host.close(); host.close(); await assert.rejects(sending, /cancelled|disconnected/);
  assert.equal(hostEvents.closedCount, 1); assert.equal(host.approved, false);
});

test('closing during ICE gathering aborts pairing without waiting for the discovery timeout', async () => {
  const observed = events(), host = new NearbyLink('host', 'Host', observed.callbacks), pc = Peer.peers.at(-1);
  pc.iceGatheringState = 'gathering';
  const offering = host.createOffer(); await flush(); host.close();
  await assert.rejects(offering, /cancelled|closed/); assert.equal(observed.closedCount, 1); assert.deepEqual(observed.codes, []);
});

test('old asynchronous pairing and stale event callbacks cannot reopen a disposed link', async () => {
  const observed = events(), host = new NearbyLink('host', 'Host', observed.callbacks), pc = Peer.peers.at(-1);
  pc.gate = deferred(); const staleStatus = pc.onconnectionstatechange;
  const offering = host.createOffer(); host.close(); pc.gate.resolve();
  await assert.rejects(offering, /closed/);
  pc.connectionState = 'connected'; staleStatus();
  assert.deepEqual(observed.statuses, []); assert.equal(observed.closedCount, 1); assert.equal(host.connected, false);
});

test('malformed, replayed or unapproved incoming payloads fail closed', async t => {
  const one = await pair(t, undefined, undefined, false);
  one.guestPeer.channel.receive({ version: 1, roomId: one.guest.roomId, sequence: 1, payload: { type: 'chat', text: 'Before consent' } });
  assert.match(one.guestEvents.errors.at(-1), /before both/); assert.equal(one.guest.connected, false);
  const two = await pair(t);
  two.hostPeer.channel.receive({ version: 1, roomId: two.host.roomId, sequence: 1, payload: { type: 'chat', text: 'Replayed sequence' } });
  assert.match(two.hostEvents.errors.at(-1), /duplicate|out-of-order/); assert.equal(two.host.connected, false);
  const three = await pair(t);
  three.hostPeer.channel.receive('{malformed');
  assert.match(three.hostEvents.errors.at(-1), /invalid/); assert.equal(three.host.connected, false);
});

test('a guest cannot bypass host authority by forging a raw navigation frame', async t => {
  const { host, hostPeer, hostEvents } = await pair(t);
  hostPeer.channel.receive({ version: 1, roomId: host.roomId, sequence: 2, payload: { type: 'reference', reference: { bookId: 'GEN', chapter: 1, verse: 1 } } });
  assert.match(hostEvents.errors.at(-1), /Only the host/); assert.equal(host.connected, false);
});

test('mismatched pairing answer can be corrected without destroying the original offer', async t => {
  const observed = events(), host = new NearbyLink('host', 'Host', observed.callbacks);
  const guest = new NearbyLink('guest', 'Guest', events().callbacks);
  t.after(() => { host.close(); guest.close(); });
  const offer = await host.createOffer(), answer = await guest.answerOffer(offer);
  const wrong = { ...JSON.parse(answer), linkId: crypto.randomUUID() };
  await assert.rejects(host.acceptAnswer(JSON.stringify(wrong)), /does not match/);
  await host.acceptAnswer(answer); assert.equal(host.connected, true); assert.equal(observed.codes.length, 1);
});
