import { parseMessage, parseSignal, participantName, verificationCode, validatePayload, MAX_WIRE_BYTES } from './protocol.ts';
import type { Role, RoomPayload, Signal } from './protocol.ts';

export interface LinkEvents {
  status: (status: string) => void;
  code: (code: string) => void;
  message: (payload: RoomPayload) => void | Promise<void>;
  error: (message: string) => void;
  closed: () => void;
}

/** No signaling service, STUN, TURN, media capture, telemetry or background reconnect. */
export class NearbyLink {
  private pc: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private offer?: Signal;
  private answer?: Signal;
  private events: LinkEvents;
  private sequence = 0;
  private lastSequence = 0;
  private rateStart = 0;
  private rateCount = 0;
  private stopped = false;
  private pairing = false;
  private receiving: Promise<void> = Promise.resolve();
  private lifetime = new AbortController();
  readonly role: Role;
  readonly name: string;
  roomId = '';
  linkId = '';
  remoteName = '';
  localApproved = false;
  remoteApproved = false;

  constructor(role: Role, name: string, events: LinkEvents) {
    if (typeof RTCPeerConnection === 'undefined' || !globalThis.isSecureContext) throw new Error('This browser needs a secure page with WebRTC data-channel support. Standalone downloaded reading remains available.');
    this.role = role; this.name = participantName(name); this.events = events;
    this.pc = new RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' });
    this.pc.onconnectionstatechange = () => {
      if (this.stopped) return;
      const state = this.pc.connectionState;
      if (state === 'failed') { this.fail(new Error('The local connection failed. Check that both devices share a LAN without client isolation, then create a fresh pairing offer.')); return; }
      if (state === 'closed') { this.close(false); return; }
      this.events.status(state);
    };
    this.pc.ondatachannel = event => {
      if (this.stopped || this.role !== 'guest' || this.channel || event.channel.label !== 'adigun-study-v1') { event.channel.close(); return; }
      this.attach(event.channel);
    };
  }

  get approved() { return this.localApproved && this.remoteApproved && this.connected; }
  get connected() { return !this.stopped && this.channel?.readyState === 'open' && this.pc.connectionState === 'connected'; }
  private assertActive() { if (this.stopped) throw new Error('Nearby connection closed. Create a fresh pairing offer to reconnect.'); }
  private fail(error: unknown) {
    if (this.stopped) return;
    this.events.error(error instanceof Error ? error.message : 'The peer sent invalid data.');
    this.close();
  }
  private attach(channel: RTCDataChannel) {
    this.channel = channel; channel.bufferedAmountLowThreshold = 32_000;
    channel.onopen = () => { if (!this.stopped) this.events.status('connected · approval required'); };
    channel.onclose = () => this.close(false);
    channel.onerror = () => this.fail(new Error('The data channel reported an error. No private workspace was sent.'));
    channel.onmessage = event => {
      if (this.stopped) return;
      try {
        if (Date.now() - this.rateStart > 1000) { this.rateStart = Date.now(); this.rateCount = 0; }
        if (++this.rateCount > 80) throw new Error('This peer sent too many messages.');
        // Check wire ordering before any potentially slow application callback.
        const message = parseMessage(event.data, this.roomId, this.lastSequence);
        this.lastSequence = message.sequence;
        const payload = message.payload;
        if (payload.type === 'leave') { this.close(false); return; }
        if (payload.type === 'ready') this.remoteApproved = true;
        else if (!this.approved) throw new Error('Shared content arrived before both participants approved this connection.');
        if (payload.type === 'reference' && this.role === 'host') throw new Error('Only the host can coordinate passage navigation.');
        const deliver = async () => { if (!this.stopped) await this.events.message(payload); };
        // Control messages must not wait behind the transfer they control.
        if (payload.type === 'pack-cancel' || payload.type === 'ready') void deliver().catch(error => this.fail(error));
        else this.receiving = this.receiving.then(deliver).catch(error => this.fail(error));
      } catch (error) { this.fail(error); }
    };
  }

  private async gathered(): Promise<void> {
    this.assertActive();
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.pc.removeEventListener('icegatheringstatechange', changed);
        this.lifetime.signal.removeEventListener('abort', aborted);
        if (error) reject(error); else resolve();
      };
      const changed = () => { if (this.pc.iceGatheringState === 'complete') finish(); };
      const aborted = () => finish(new Error('Pairing cancelled because the nearby connection closed.'));
      const timer = setTimeout(() => finish(new Error('Local address discovery timed out. Try a fresh offer on a supported shared network.')), 12_000);
      this.pc.addEventListener('icegatheringstatechange', changed);
      this.lifetime.signal.addEventListener('abort', aborted, { once: true });
      if (this.lifetime.signal.aborted) aborted(); else changed();
    });
    this.assertActive();
  }
  private signal(role: Role, expiresAt: number): Signal {
    this.assertActive();
    const description = this.pc.localDescription;
    if (!description?.sdp) throw new Error('No local pairing description is available.');
    return parseSignal(JSON.stringify({ kind: 'adigun-nearby-signal', version: 1, roomId: this.roomId, linkId: this.linkId, role, name: this.name, expiresAt, description: { type: description.type, sdp: description.sdp } }));
  }
  async createOffer(): Promise<string> {
    this.assertActive();
    if (this.role !== 'host' || this.offer || this.pairing) throw new Error('Create a new room before making another offer.');
    this.pairing = true;
    try {
      this.roomId = crypto.randomUUID(); this.linkId = crypto.randomUUID();
      this.attach(this.pc.createDataChannel('adigun-study-v1', { ordered: true }));
      const description = await this.pc.createOffer(); this.assertActive();
      await this.pc.setLocalDescription(description); this.assertActive();
      await this.gathered();
      this.offer = this.signal('host', Date.now() + 10 * 60_000);
      return JSON.stringify(this.offer);
    } catch (error) { this.close(); throw error; }
    finally { this.pairing = false; }
  }
  async answerOffer(raw: string): Promise<string> {
    this.assertActive();
    if (this.role !== 'guest' || this.offer || this.pairing) throw new Error('Create a new room before accepting another offer.');
    const offer = parseSignal(raw);
    if (offer.role !== 'host') throw new Error('A guest must receive the host’s offer.');
    this.pairing = true;
    try {
      this.offer = offer; this.roomId = offer.roomId; this.linkId = offer.linkId; this.remoteName = offer.name;
      await this.pc.setRemoteDescription(offer.description); this.assertActive();
      const description = await this.pc.createAnswer(); this.assertActive();
      await this.pc.setLocalDescription(description); this.assertActive();
      await this.gathered();
      this.answer = this.signal('guest', offer.expiresAt);
      const code = await verificationCode(offer, this.answer); this.assertActive();
      this.events.code(code);
      return JSON.stringify(this.answer);
    } catch (error) { this.close(); throw error; }
    finally { this.pairing = false; }
  }
  async acceptAnswer(raw: string): Promise<void> {
    this.assertActive();
    if (this.role !== 'host' || !this.offer || this.answer || this.pairing) throw new Error('Generate a host offer first.');
    const answer = parseSignal(raw);
    if (answer.role !== 'guest' || answer.roomId !== this.roomId || answer.linkId !== this.linkId || answer.expiresAt !== this.offer.expiresAt) throw new Error('That answer does not match this room offer.');
    this.pairing = true;
    try {
      await this.pc.setRemoteDescription(answer.description); this.assertActive();
      const code = await verificationCode(this.offer, answer); this.assertActive();
      this.answer = answer; this.remoteName = answer.name;
      this.events.code(code);
    } catch (error) { this.close(); throw error; }
    finally { this.pairing = false; }
  }
  approve() {
    this.assertActive();
    if (!this.connected || !this.offer || !this.answer) throw new Error('Finish pairing before approval.');
    this.send({ type: 'ready' }); this.localApproved = true;
  }
  send(value: RoomPayload) {
    this.assertActive();
    const payload = validatePayload(value);
    if (!this.connected || !this.channel) throw new Error('The peer is disconnected. Create a fresh pairing offer to reconnect.');
    if (payload.type !== 'ready' && payload.type !== 'leave' && !this.approved) throw new Error('Both participants must approve the matching verification code.');
    if (payload.type === 'reference' && this.role !== 'host') throw new Error('Only the host can coordinate passages.');
    const sequence = this.sequence + 1;
    const raw = JSON.stringify({ version: 1, roomId: this.roomId, sequence, payload });
    if (new TextEncoder().encode(raw).byteLength > MAX_WIRE_BYTES) throw new Error('The message exceeds the supported limit.');
    if (this.channel.bufferedAmount > 200_000) throw new Error('The local connection is busy. Wait for the current transfer before sending more.');
    this.channel.send(raw); this.sequence = sequence;
  }
  private async drain(channel: RTCDataChannel, signal: AbortSignal): Promise<void> {
    if (signal.aborted || this.stopped) throw new Error('Passage transfer cancelled.');
    if (channel.readyState !== 'open') throw new Error('The transfer peer disconnected.');
    if (channel.bufferedAmount <= 64_000) return;
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        channel.removeEventListener('bufferedamountlow', low);
        channel.removeEventListener('close', closed); channel.removeEventListener('error', closed);
        signal.removeEventListener('abort', aborted); this.lifetime.signal.removeEventListener('abort', aborted);
        if (error) reject(error); else resolve();
      };
      const low = () => { if (channel.bufferedAmount <= 64_000) finish(); };
      const aborted = () => finish(new Error('Passage transfer cancelled.'));
      const closed = () => finish(new Error('The transfer peer disconnected.'));
      const timer = setTimeout(() => finish(new Error('Passage transfer timed out.')), 10_000);
      channel.addEventListener('bufferedamountlow', low);
      channel.addEventListener('close', closed, { once: true }); channel.addEventListener('error', closed, { once: true });
      signal.addEventListener('abort', aborted, { once: true }); this.lifetime.signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted || this.stopped) aborted(); else if (channel.readyState !== 'open') closed(); else low();
    });
  }
  async sendChunks(transferId: string, chunks: string[], signal: AbortSignal, onProgress: (sent: number, total: number) => void) {
    for (let index = 0; index < chunks.length; index++) {
      if (signal.aborted || this.stopped) throw new Error('Passage transfer cancelled.');
      const channel = this.channel;
      if (!channel || !this.connected) throw new Error('The transfer peer disconnected.');
      await this.drain(channel, signal);
      // A cancellation can race the buffer-drained event in the same turn.
      if (signal.aborted || this.stopped) throw new Error('Passage transfer cancelled.');
      this.send({ type: 'pack-chunk', transferId, index, data: chunks[index] });
      onProgress(index + 1, chunks.length);
    }
  }
  close(notifyPeer = true) {
    if (this.stopped) return;
    try { if (notifyPeer && this.connected) this.send({ type: 'leave' }); } catch { /* Closing is always possible. */ }
    this.stopped = true; this.localApproved = false; this.remoteApproved = false;
    this.lifetime.abort();
    if (this.channel) {
      this.channel.onopen = this.channel.onclose = this.channel.onerror = this.channel.onmessage = null;
      this.channel.close();
    }
    this.pc.onconnectionstatechange = this.pc.ondatachannel = null;
    this.pc.close(); this.events.closed();
  }
}
