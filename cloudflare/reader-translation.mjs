const tones = new Map([
  ['pcm', [
    'Translate into natural Nigerian Pidgin English. Use idiomatic Nigerian Pidgin grammar and phrasing. Read each verse back for fluency and remove redundant phrasing.',
    'Keep family relationships pointing in the right direction. For “his one and only Son”, use “di only Son wey God get” or equivalent. Never say the Son gave birth to God.',
    'For “that the world should be saved through him”, keep the world as the people being saved and the Son as the means of salvation.',
  ].join(' ')],
  ['gen-z', [
    'Render in conversational Gen Z English. Use contractions, direct wording, and slang only where it preserves the meaning and emotional weight.',
    'Do not add filler reactions such as “lowkey”, “for real”, or “no cap”. Keep concrete images such as clothing and nakedness, and keep expressions of worship as worship.',
    'Use at most one fitting emoji for a passage whose source clearly expresses joy or celebration. Omit emojis throughout passages about grief, loss, suffering, or judgment, even when the speaker also blesses God.',
    'For example, “God so loved the world” can become “God loved the world so much”, and “Blessed be the name of the LORD” can become “Bless the LORD’s name.”',
  ].join(' ')],
]);

const fidelityInstructions = 'Preserve every claim, condition, contrast, negation, speaker, and verse boundary. Keep names, key theological terms, and meaningful imagery. Do not make a claim stronger or weaker, turn it into a different claim, or add an attitude the source does not express. Favor clear wording over forced slang. Read each verse against its source before returning it. Do not add commentary. Return a JSON object with a verses array of objects with number and text, in the original order.';

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
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: tones.get(tone) + ' ' + fidelityInstructions },
        { role: 'user', content: JSON.stringify(verses.map(({ number, text }) => ({ number, text }))) },
      ],
    });
    const output = typeof result.response === 'string'
      ? JSON.parse(result.response.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ''))
      : result.response;
    const rows = Array.isArray(output) ? output : output?.verses;
    if (!Array.isArray(rows) || rows.length !== verses.length || rows.some((row, index) =>
      row?.number !== verses[index].number || typeof row.text !== 'string' || !row.text.trim() || row.text.length > 3000))
      return new Response(null, { status: 502 });
    return Response.json(rows.map(({ number, text }) => ({ number, text })), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Reading translation failed', error instanceof Error ? error.message : 'Unexpected error');
    return new Response(null, { status: 502 });
  }
}
