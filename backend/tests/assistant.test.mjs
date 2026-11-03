// Deliberate unit-test doubles only. No real Auth, database, email or model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantHandler, parseProviderJson } from '../assistant.mjs';
import { createSupabaseAuthenticator } from '../supabase-auth.mjs';
import { createFileSourceResolver } from '../source-catalog.mjs';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const userId = '00000000-0000-4000-8000-000000000001';
const reference = { corpus: 'bible', editionId: 'eng-web', bookId: 'GEN', chapter: 1, verse: 1 };
const body = { question: 'What does this passage state?', locale: 'en', references: [reference] };
const fixtureSource = { text: 'Unit-test source text.', attribution: 'Unit-test fixture', sourceUrl: 'https://example.org/test-source', sha256: 'a'.repeat(64) };
const request = (input = body, extra = {}) => new Request('https://api.example.org/assistant', {
  method: 'POST', headers: { Authorization: 'Bearer unit-test-token', 'Content-Type': 'application/json', ...extra.headers },
  body: JSON.stringify(input), ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'headers')),
});
function setup(overrides = {}) {
  const calls = { auth: 0, source: 0, quota: 0, provider: 0 };
  const deps = {
    authenticate: async () => { calls.auth++; return { userId, isAnonymous: false }; },
    resolveSource: async () => { calls.source++; return fixtureSource; },
    limiter: { durable: true, consume: async () => { calls.quota++; return { allowed: true, retryAfterSeconds: 0 }; } },
    provider: { generate: async () => { calls.provider++; return { status: 'answer', answer: 'Unit-test generated commentary.', citations: ['source-1'] }; } },
    ...overrides,
  };
  return { calls, handler: createAssistantHandler(deps) };
}

test('missing token and anonymous Auth identities cannot reach provider', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request(body, { headers: { Authorization: '' } }))).status, 401);
  assert.equal(calls.auth, 0);
  const anonymous = setup({ authenticate: async () => ({ userId, isAnonymous: true }) });
  assert.equal((await anonymous.handler(request())).status, 401);
  assert.equal(anonymous.calls.provider, 0);
});

test('unconfigured auth/provider/quota fail closed without fabricated answer', async () => {
  for (const [overrides, code] of [
    [{ authenticate: undefined }, 'AUTH_NOT_CONFIGURED'],
    [{ provider: undefined }, 'PROVIDER_NOT_CONFIGURED'],
    [{ limiter: undefined }, 'QUOTA_NOT_CONFIGURED'],
    [{ limiter: { durable: false, consume: async () => ({ allowed: true, retryAfterSeconds: 0 }) } }, 'QUOTA_NOT_CONFIGURED'],
    [{ resolveSource: undefined }, 'SOURCES_NOT_CONFIGURED'],
  ]) {
    const { handler } = setup(overrides);
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: code });
  }
});

test('private context, arbitrary source text and client actor IDs are rejected', async () => {
  for (const field of ['notes', 'prayers', 'readingHistory', 'userId', 'sourceText', 'provider', 'model', 'messages']) {
    const { handler, calls } = setup();
    assert.equal((await handler(request({ ...body, [field]: 'private or untrusted' }))).status, 400);
    assert.equal(calls.provider, 0);
  }
});

test('canonical references reject traversal, cross-corpus IDs, missing fields and excessive ranges', async () => {
  for (const bad of [
    { ...reference, bookId: '../GEN' }, { ...reference, editionId: '../../secret' },
    { ...reference, corpus: 'quran' }, { ...reference, chapter: 0 },
    { ...reference, verse: 1.5 }, { ...reference, endVerse: 30 }, { ...reference, text: 'forged text' },
  ]) {
    const { handler, calls } = setup();
    assert.equal((await handler(request({ ...body, references: [bad] }))).status, 400);
    assert.equal(calls.source, 0);
  }
});

test('streamed request limit applies without a content-length header', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...body, question: 'x'.repeat(20_000) }));
  const req = new Request('https://api.example.org/assistant', {
    method: 'POST', headers: { Authorization: 'Bearer unit-test-token', 'Content-Type': 'application/json' },
    body: new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 9000)); controller.enqueue(bytes.subarray(9000)); controller.close(); } }), duplex: 'half',
  });
  const { handler, calls } = setup();
  assert.equal((await handler(req)).status, 413);
  assert.equal(calls.source, 0);
});

test('invalid JSON and media types fail before source/provider work', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request(body, { body: '{broken' }))).status, 400);
  assert.equal((await handler(request(body, { headers: { 'Content-Type': 'text/plain' } }))).status, 415);
  assert.equal(calls.provider, 0);
});

test('missing sources and overlarge context do not consume model quota', async () => {
  for (const resolveSource of [async () => null, async () => ({ ...fixtureSource, text: 'a'.repeat(12_001) })]) {
    const { handler, calls } = setup({ resolveSource });
    const response = await handler(request());
    assert.ok([400, 503].includes(response.status));
    assert.equal(calls.quota, 0);
    assert.equal(calls.provider, 0);
  }
});

test('only projected source context reaches provider; user identity and token stay server-side', async () => {
  let providerInput, quotaInput;
  const { handler } = setup({
    resolveSource: async () => ({ ...fixtureSource, privateNotes: 'must not leave', userId }),
    limiter: { durable: true, consume: async input => { quotaInput = input; return { allowed: true, retryAfterSeconds: 0 }; } },
    provider: { generate: async input => { providerInput = input; return { status: 'answer', answer: 'Unit-test output.', citations: ['source-1'] }; } },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(quotaInput.userId, userId);
  assert.equal(providerInput.maxOutputTokens, 800);
  assert.equal(providerInput.question, body.question);
  assert.deepEqual(Object.keys(providerInput.sources[0]).sort(), ['attribution', 'id', 'reference', 'sha256', 'sourceUrl', 'text']);
  assert.ok(!JSON.stringify(providerInput).includes(userId));
  assert.ok(!JSON.stringify(providerInput).includes('unit-test-token'));
  assert.ok(!JSON.stringify(providerInput).includes('must not leave'));
  const output = await response.json();
  assert.equal(output.reviewStatus, 'unreviewed');
  assert.equal(output.label, 'Generated study commentary');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('quota denial prevents provider work and returns retry time', async () => {
  const { handler, calls } = setup({ limiter: { durable: true, consume: async () => ({ allowed: false, retryAfterSeconds: 42 }) } });
  const response = await handler(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '42');
  assert.equal(calls.provider, 0);
});

test('quota store failure or malformed quota result fails closed', async () => {
  for (const consume of [async () => { throw new Error('private database secret'); }, async () => ({ allowed: true })]) {
    const { handler, calls } = setup({ limiter: { durable: true, consume } });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('secret'));
    assert.equal(calls.provider, 0);
  }
});

test('provider errors are generic and unavailable is never an AI answer', async () => {
  const { handler } = setup({ provider: { generate: async () => { throw new Error('API_KEY=private-test-value'); } } });
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'PROVIDER_UNAVAILABLE' });
});

test('unknown citations, fake approval fields and uncited output are rejected', async () => {
  for (const output of [
    { status: 'answer', answer: 'Unsupported test text', citations: ['external-source'] },
    { status: 'answer', answer: 'Test text', citations: [] },
    { status: 'answer', answer: 'Test text', citations: ['source-1'], reviewStatus: 'approved' },
  ]) {
    const { handler } = setup({ provider: { generate: async () => output } });
    assert.equal((await handler(request())).status, 502);
  }
});

test('insufficient sources result contains no invented explanation', async () => {
  const { handler } = setup({ provider: { generate: async () => ({ status: 'insufficient_sources', answer: null, citations: [] }) } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).answer, null);
});

test('timeout responds even when a provider ignores cancellation', async () => {
  const { handler } = setup({ timeoutMs: 10, provider: { generate: () => new Promise(resolve => setTimeout(() => resolve({}), 40)) } });
  const response = await handler(request());
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: 'REQUEST_TIMEOUT' });
});

test('client cancellation is propagated to dependencies', async () => {
  const controller = new AbortController();
  let providerSignal;
  const { handler } = setup({ provider: { generate: ({ signal }) => new Promise(resolve => { providerSignal = signal; setTimeout(() => controller.abort(), 5); setTimeout(() => resolve({}), 40); }) } });
  const response = await handler(request(body, { signal: controller.signal }));
  assert.equal(response.status, 499);
  assert.equal(providerSignal.aborted, true);
});

test('exact CORS origin and preflight controls do not call Auth', async () => {
  const { handler, calls } = setup({ allowedOrigins: ['https://study.example.org'] });
  assert.equal((await handler(request(body, { headers: { Origin: 'https://evil.example.org' } }))).status, 403);
  const allowed = await handler(new Request('https://api.example.org/assistant', { method: 'OPTIONS', headers: { Origin: 'https://study.example.org', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://study.example.org');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
  assert.equal(calls.auth, 0);
});

test('bounded provider JSON parser refuses oversized output', () => {
  assert.throws(() => parseProviderJson('a'.repeat(32_769)));
  assert.throws(() => parseProviderJson('{bad'));
});

test('Supabase auth needs live session verifier and ignores editable metadata', async () => {
  const config = { url: 'https://test-project.supabase.co', publishableKey: 'sb_publishable_unit_test_only' };
  assert.equal(createSupabaseAuthenticator(config), undefined);
  let call;
  const auth = createSupabaseAuthenticator({ ...config,
    fetchImpl: async (url, options) => { call = { url, options }; return Response.json({ id: userId, is_anonymous: false, user_metadata: { role: 'owner' } }); },
    requireActiveSession: async ({ userId: received }) => received === userId,
  });
  assert.deepEqual(await auth('test-token', { signal: new AbortController().signal }), { userId, isAnonymous: false });
  assert.equal(call.url.pathname, '/auth/v1/user');
  assert.equal(call.options.headers.Authorization, 'Bearer test-token');
  const revoked = createSupabaseAuthenticator({ ...config, fetchImpl: async () => Response.json({ id: userId, is_anonymous: false }), requireActiveSession: async () => false });
  assert.equal(await revoked('test-token', { signal: new AbortController().signal }), null);
});

test('trusted file resolver preserves actual imported Bible and Quran text', async () => {
  const dataRoot = fileURLToPath(new URL('../../data/', import.meta.url));
  const resolveSource = createFileSourceResolver({ dataRoot });
  const source = await resolveSource({ ...reference, endVerse: 1 });
  const book = JSON.parse(await readFile(`${dataRoot}/books/GEN.json`, 'utf8'));
  assert.equal(source.text, book.chapters[0].verses[0].text);
  assert.match(source.sha256, /^[0-9a-f]{64}$/);
  const quran = await resolveSource({ corpus: 'quran', editionId: 'eng-clearquran', bookId: 'QUR', chapter: 1, verse: 1, endVerse: 1 });
  const original = JSON.parse(await readFile(`${dataRoot}/editions/eng-clearquran/quran.json`, 'utf8'));
  assert.equal(quran.text, original.surahs[0].verses[0].text);
});

test('trusted resolver does not fill omitted Yoruba verses or allow traversal', async () => {
  const resolveSource = createFileSourceResolver({ dataRoot: fileURLToPath(new URL('../../data/', import.meta.url)) });
  await assert.rejects(resolveSource({ ...reference, editionId: 'yor', bookId: 'MAT', chapter: 17, verse: 21, endVerse: 21 }));
  await assert.rejects(resolveSource({ ...reference, bookId: '../GEN', endVerse: 1 }));
  const source = await resolveSource({ ...reference, editionId: 'yor', bookId: 'MAT', chapter: 17, verse: 22, endVerse: 22 });
  assert.ok(source.text.length > 10);
});
