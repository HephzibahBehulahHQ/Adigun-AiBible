export const SOURCE_ENVELOPE_KIND = 'adigun.source-envelope';
export const SOURCE_JSON_MAX_BYTES = 64 * 1024 * 1024;
export const SOURCE_GZIP_MAX_BYTES = 24 * 1024 * 1024;
export const SOURCE_BASE64_MAX_CHARS = 4 * Math.ceil(SOURCE_GZIP_MAX_BYTES / 3);
export const SOURCE_MAX_EXPANSION_RATIO = 128;
const envelopeKeys = ['kind', 'version', 'encoding', 'decodedBytes', 'decodedSha256', 'payload'];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const envelopeLike = (value: unknown): boolean => object(value) && (value.kind === SOURCE_ENVELOPE_KIND || ['encoding', 'decodedBytes', 'decodedSha256', 'payload'].some(key => Object.hasOwn(value, key)));
const abortIfNeeded = (signal?: AbortSignal): void => { if (signal?.aborted) throw new DOMException('Source loading cancelled.', 'AbortError'); };

function byteLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > SOURCE_JSON_MAX_BYTES) throw new Error('Invalid source JSON byte limit.');
}

/** Fixed-size blocks also bound metadata overhead when a stream delivers very small chunks. */
async function boundedBytes(stream: ReadableStream<Uint8Array> | null, limit: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  byteLimit(limit);
  if (signal?.aborted && stream) void stream.cancel().catch(() => undefined);
  abortIfNeeded(signal);
  if (!stream) return new Uint8Array();
  const reader = stream.getReader(), blocks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  const blockSize = Math.max(1, Math.min(64 * 1024, limit));
  let block = new Uint8Array(blockSize), used = 0, total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      abortIfNeeded(signal);
      if (done) break;
      if (!(value instanceof Uint8Array) || total + value.byteLength > limit) throw new Error('Source JSON exceeds its allowed byte limit.');
      total += value.byteLength;
      let offset = 0;
      while (offset < value.byteLength) {
        const take = Math.min(blockSize - used, value.byteLength - offset);
        block.set(value.subarray(offset, offset + take), used); used += take; offset += take;
        if (used === blockSize) { blocks.push(block); block = new Uint8Array(blockSize); used = 0; }
      }
    }
  } catch (error) {
    // Cancellation closes this reader immediately. Its promise can wait for an
    // unread sibling of a cloned response; failure must not await that consumer.
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of blocks) { bytes.set(part, offset); offset += part.byteLength; }
  bytes.set(block.subarray(0, used), offset);
  return bytes;
}

function parseJson(bytes: Uint8Array): unknown {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('The source is not valid UTF-8 JSON.'); }
  if (!value || typeof value !== 'object') throw new Error('The source JSON must contain an object or array.');
  return value;
}

/** Fixed-block response reading shared by source decoding and outer-hash verification. */
export async function readSourceBytes(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || response.type === 'opaque') throw new Error('The source JSON response is unavailable.');
  return boundedBytes(response.body, maxBytes, signal);
}

export async function readBoundedJson(response: Response, maxBytes: number, signal?: AbortSignal): Promise<unknown> {
  return parseJson(await readSourceBytes(response, maxBytes, signal));
}

function base64Bytes(payload: string): Uint8Array<ArrayBuffer> {
  if (!payload.length || payload.length > SOURCE_BASE64_MAX_CHARS || payload.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(payload)) throw new Error('The source envelope has invalid base64 data.');
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  if (payload.slice(0, payload.length - padding).includes('=')) throw new Error('The source envelope has invalid base64 padding.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const last = alphabet.indexOf(payload[payload.length - padding - 1]);
  if (last < 0 || padding === 2 && last % 16 !== 0 || padding === 1 && last % 4 !== 0) throw new Error('The source envelope has noncanonical base64 padding.');
  const length = payload.length / 4 * 3 - padding;
  if (length < 18 || length > SOURCE_GZIP_MAX_BYTES) throw new Error('The compressed source exceeds its allowed byte limit.');
  if (typeof atob !== 'function') throw new Error('This browser cannot decode compressed scripture. Use a current browser.');
  let binary: string;
  try { binary = atob(payload); }
  catch { throw new Error('The source envelope has invalid base64 data.'); }
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Decodes already verified transferred bytes without another response read or input copy. */
export async function decodeSourceJsonBytes(bytes: Uint8Array, signal?: AbortSignal): Promise<unknown> {
  abortIfNeeded(signal);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > SOURCE_JSON_MAX_BYTES) throw new Error('Source JSON exceeds its allowed byte limit.');
  const value = parseJson(bytes);
  if (!envelopeLike(value)) return value;
  if (!object(value) || Object.keys(value).length !== envelopeKeys.length || envelopeKeys.some(key => !Object.hasOwn(value, key))
    || value.kind !== SOURCE_ENVELOPE_KIND || value.version !== 1 || value.encoding !== 'gzip-base64'
    || typeof value.decodedBytes !== 'number' || !Number.isSafeInteger(value.decodedBytes) || value.decodedBytes < 1 || value.decodedBytes > SOURCE_JSON_MAX_BYTES
    || typeof value.decodedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.decodedSha256) || typeof value.payload !== 'string') {
    throw new Error('The compressed source envelope is invalid or unsupported.');
  }
  const compressed = base64Bytes(value.payload);
  if (value.decodedBytes > Math.max(1024, compressed.byteLength * SOURCE_MAX_EXPANSION_RATIO)) throw new Error('The source envelope exceeds the allowed expansion ratio.');
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress scripture. Use a current browser with gzip decompression support.');
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify compressed scripture. Use a current browser over HTTPS.');
  let decoded: Uint8Array<ArrayBuffer>;
  try {
    const stream = new Blob([compressed.buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    decoded = await boundedBytes(stream, value.decodedBytes, signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof Error && error.message.includes('byte limit')) throw error;
    throw new Error('The compressed scripture could not be decoded. Reconnect and update the application.');
  }
  if (decoded.byteLength !== value.decodedBytes) throw new Error('The decoded source byte count does not match its envelope.');
  const digest = await crypto.subtle.digest('SHA-256', decoded);
  abortIfNeeded(signal);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== value.decodedSha256) throw new Error('The decoded source checksum does not match its envelope.');
  const result = parseJson(decoded);
  if (envelopeLike(result)) throw new Error('Nested source envelopes are not supported.');
  return result;
}

/** Reads either unchanged development JSON or one verified build-only transport envelope. */
export async function readSourceJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  return decodeSourceJsonBytes(await readSourceBytes(response, SOURCE_JSON_MAX_BYTES, signal), signal);
}
