import { useEffect, useMemo, useState } from 'react';
import { getBook, getManifest } from '../data';
import type { Book, Edition, Manifest, Reference } from '../types';
import './parallel-versions.css';

function ParallelPane({ edition, reference }: { edition: Edition; reference: Reference }) {
  const [data, setData] = useState<{ book: Book; manifest: Manifest } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    Promise.all([getBook(reference.bookId, edition.id), getManifest(edition.id)])
      .then(([book, manifest]) => { if (active) setData({ book, manifest }); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'This version could not be opened.'); });
    return () => { active = false; };
  }, [edition.id, reference.bookId, reference.chapter]);
  const chapter = data?.book.chapters.find(item => item.number === reference.chapter);
  const available = data?.manifest.books.find(item => item.id === reference.bookId);
  return <section className="parallel-version-pane" lang={edition.language} dir={edition.direction || 'ltr'}>
    <h3>{edition.name}</h3>
    {error ? <p className="muted" role="status">{error}</p> : !data ? <p className="muted" role="status">Loading {edition.name}…</p>
      : !available || !chapter ? <p className="muted" role="status">This book or chapter is unavailable in this version.</p>
        : <ol className="parallel-verse-list">{chapter.verses.map(verse => <li key={`${verse.number}:${verse.endNumber || ''}`}><span>{verse.number}{verse.endNumber && verse.endNumber !== verse.number ? `–${verse.endNumber}` : ''}</span><p>{verse.text}</p></li>)}</ol>}
  </section>;
}

export default function ParallelVersions({ reference, primaryEditionId, editions }: { reference: Reference; primaryEditionId: string; editions: Edition[] }) {
  const available = useMemo(() => editions.filter(item => item.corpus === 'bible'), [editions]);
  const [count, setCount] = useState(2);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const other = available.find(item => item.id !== primaryEditionId)?.id;
    setSelected([primaryEditionId, other || primaryEditionId]);
  }, [primaryEditionId, available]);
  function setVersionCount(next: number) {
    setCount(next);
    setSelected(current => Array.from({ length: next }, (_, index) => current[index] || available.find(item => !current.includes(item.id))?.id || available[index % Math.max(1, available.length)]?.id || primaryEditionId));
  }
  function setVersion(index: number, editionId: string) {
    setSelected(current => current.map((value, position) => position === index ? editionId : value));
  }
  return <section className="parallel-versions" aria-label="Parallel Bible versions">
    <div className="parallel-versions-heading"><div><span className="eyebrow">OPTIONAL SIDE-BY-SIDE READING</span><h2>Parallel Versions</h2><p>Choose 2 to 5 installed versions for this passage.</p></div>
      <label>Show<select aria-label="Number of parallel versions" value={count} onChange={event => setVersionCount(Number(event.target.value))}>{[2, 3, 4, 5].map(number => <option key={number} value={number}>{number} Parallel Versions</option>)}</select></label></div>
    <div className="parallel-version-choices">{Array.from({ length: count }, (_, index) => <label key={index}>Version {index + 1}<select aria-label={`Parallel version ${index + 1}`} value={selected[index] || primaryEditionId} onChange={event => setVersion(index, event.target.value)}>{available.map(edition => <option key={edition.id} value={edition.id} disabled={selected.some((value, position) => position !== index && value === edition.id)}>{edition.name}</option>)}</select></label>)}</div>
    <div className="parallel-version-grid">{Array.from({ length: count }, (_, index) => { const edition = available.find(item => item.id === selected[index]); return edition ? <ParallelPane key={`${index}:${edition.id}`} edition={edition} reference={reference}/> : null; })}</div>
  </section>;
}
