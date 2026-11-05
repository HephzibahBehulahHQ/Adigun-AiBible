import { useEffect, useState } from 'react';
import { getBook, getManifest, sourceCredit } from '../data';
import type { Edition, Reference, Verse } from '../types';

export default function SourcePassage({ reference, editionId, onOpenReference }: { reference: Reference; editionId: string; onOpenReference: (reference: Reference) => void }) {
  const key = `${editionId}:${reference.bookId}:${reference.chapter}:${reference.verse}:${reference.endVerse || reference.verse}`;
  const [result, setResult] = useState<{ key: string; verses?: Verse[]; context?: Verse[]; edition?: Edition; error?: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([getBook(reference.bookId, editionId), getManifest(editionId)]).then(([book, manifest]) => {
      const chapter = book.chapters.find(item => item.number === reference.chapter), end = reference.endVerse || reference.verse;
      if (!chapter) throw new Error('The supporting chapter is absent from this edition.');
      const verses = chapter.verses.filter(item => item.number >= reference.verse && item.number <= end);
      if (verses.length !== end - reference.verse + 1) throw new Error('This edition lacks a required supporting verse number. Open its chapter to inspect the available wording.');
      if (active) setResult({ key, verses, edition: manifest.edition, context: chapter.verses.filter(item => item.number >= reference.verse - 2 && item.number <= end + 2) });
    }).catch(reason => { if (active) setResult({ key, error: reason instanceof Error ? reason.message : 'Supporting source unavailable.' }); });
    return () => { active = false; };
  }, [editionId, key, reference, retry]);
  return <div className="bi-support-passage">{result?.key !== key ? <p role="status">Opening this source passage…</p> : result.error ? <><p role="alert">{result.error} No alternative edition is substituted.</p><button className="secondary" onClick={() => setRetry(value => value + 1)}>Retry supporting passage</button></> : <><p className="source-label">{result.edition?.name} · exact source wording</p><div lang={result.edition?.language}>{result.verses?.map(verse => <p key={verse.number}><sup>{reference.chapter}:{verse.number}</sup> {verse.text}</p>)}</div><details><summary>Supporting passage context</summary>{result.context?.map(verse => <p key={verse.number}><sup>{reference.chapter}:{verse.number}</sup> {verse.text}</p>)}</details><details><summary>Supporting edition attribution</summary><p className="bi-credit">{result.edition && sourceCredit(result.edition)}</p></details></>}<button className="text-button" onClick={() => onOpenReference({ ...reference, editionId })}>Open supporting passage in reader</button></div>;
}
