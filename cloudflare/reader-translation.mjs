const tones = new Map([
  ['pcm', 'Translate into natural Nigerian Pidgin English.'],
  ['gen-z', 'Render in conversational Gen Z English with natural slang and a few fitting emojis.'],
]);

export async function translateReadingPassage(request, env) {
  if (request.method === 'GET') {
    return Response.json({ available: Boolean(env.AI && env.TRANSLATION_LIMITER) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!env.AI || !env.TRANSLATION_LIMITER) return new Response(null, { status: 503 });
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  if (!request.body || !request.headers.get('content-type')?.startsWith('application/json'))
    return new Response(null, { status: 415 });
  let payload;
  try {
    const reader = request.body.getReader();
    let body = '';
    let bytes = 0;
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    payload = JSON.parse(body + decoder.decode());
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    const { bookId, chapter, verse, endVerse = verse, tone } = payload ?? {};
    if (typeof bookId !== 'string' || !/^[1-3]?[A-Z]{2,3}$/.test(bookId) ||
        ![chapter, verse, endVerse].every(n => Number.isInteger(n) && n > 0 && n <= 200) ||
        endVerse < verse || endVerse - verse >= 8 || !tones.has(tone))
      return new Response(null, { status: 400 });

    // Only the pinned World English Bible is approved for this endpoint.
    const source = await env.ASSETS.fetch(new URL('/data/books/' + bookId + '.json', request.url));
    if (!source.ok || !source.headers.get('content-type')?.includes('json'))
      return new Response(null, { status: 404 });
    const book = await source.json();
    const verses = book.chapters?.find(row => row.number === chapter)?.verses
      .filter(row => row.number >= verse && row.number <= endVerse);
    if (!verses || verses.length !== endVerse - verse + 1 || verses.some(row => !row.text.trim()))
      return new Response(null, { status: 404 });
    const rate = await env.TRANSLATION_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'anonymous' });
    if (!rate.success) return new Response(null, { status: 429 });
    const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      max_tokens: 1800,
      temperature: 0.2,
      messages: [
        { role: 'system', content: tones.get(tone) + ' Preserve meaning, speakers and verse boundaries. Do not add claims or commentary. Return only a JSON array of objects with number and text, in the original order.' },
        { role: 'user', content: JSON.stringify(verses.map(({ number, text }) => ({ number, text }))) },
      ],
    });
    const rows = JSON.parse(result.response);
    if (!Array.isArray(rows) || rows.length !== verses.length || rows.some((row, index) =>
      row?.number !== verses[index].number || typeof row.text !== 'string' || !row.text.trim() || row.text.length > 3000))
      return new Response(null, { status: 502 });
    return Response.json(rows.map(({ number, text }) => ({ number, text })), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
