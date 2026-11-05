import type { DebateRecord } from './model';
import { safeSourceUrl } from './model';
import './context.css';

export type { DebateRecord } from './model';

export default function ThisIsDebated({ debate }: { debate: DebateRecord }) {
  const positions = debate.positions.filter(position => position.name.trim() && position.summary.trim() && position.representativeSources.some(source => source.label.trim() && safeSourceUrl(source.url)));
  return <details className="context-debate" lang="en">
    <summary><span className="context-debate-badge">This is debated</span> {debate.title}</summary>
    <p>{debate.summary}</p>
    <p className="context-review">AI-assisted summaries · human review pending. These named sources represent positions, not every member of a tradition.</p>
    {positions.length >= 2 ? <div>{positions.map(position => <section key={position.name}><h4>{position.name}</h4><p>{position.summary}</p><ul>{position.representativeSources.filter(source => safeSourceUrl(source.url)).map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul></section>)}</div> : <p>Two or more verified representative sources are still needed before a comparison of positions can be shown.</p>}
  </details>;
}
