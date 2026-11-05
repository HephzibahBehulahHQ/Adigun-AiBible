import { ArrowRight, BookMarked, Headphones, HeartHandshake, NotebookPen, Presentation, ScanText, ScrollText } from 'lucide-react';
import type { View } from './types';
import './tools.css';

const tools = [
  { view: 'ministry', icon: NotebookPen, title: 'Teaching workspace', description: 'Prepare private outlines, source quotations, series and participant handouts on this device.' },
  { view: 'law-diary', icon: ScrollText, title: 'Law Diary', description: 'Explore source-led timelines, social laws, money, sermons, evangelism, apostles, and Second Coming texts.' },
  { view: 'editions', icon: BookMarked, title: 'Bible editions', description: 'Find an installed source, inspect its permissions, and compare two to four editions.' },
  { view: 'study', icon: NotebookPen, title: 'Personal workspace', description: 'Keep prayer entries, passage collections, reading plans, memory practice, and reflections on this device.' },
  { view: 'family', icon: HeartHandshake, title: 'Family archive', description: 'Preserve authorized recordings, memories, photographs, and documents beside passages.' },
  { view: 'audio', icon: Headphones, title: 'Audio reader', description: 'Build a listening queue with available device voices, repetition, and a sleep timer.' },
  { view: 'evidence', icon: ScanText, title: 'Sermon evidence', description: 'Check references in a transcript against exact source wording and inspect uncertain findings.' },
  { view: 'support', icon: HeartHandshake, title: 'Support resources', description: 'Choose a country and find verified official emergency, listening and health-service links.' },
  { view: 'projection', icon: Presentation, title: 'Projection', description: 'Prepare source passages for an audience, with separate presenter controls and a reading timer.' },
] as const;

export default function ToolDirectory({ onNavigate }: { onNavigate: (view: View) => void }) {
  return <div className="page" lang="en">
    <div className="page-heading"><span className="eyebrow">READ. LISTEN. REMEMBER.</span><h1>Study tools</h1><p>Choose a tool for the passage you are reading. Personal writing and family files stay on this device.</p></div>
    <div className="study-tools-grid">{tools.map(({ view, icon: Icon, title, description }) => <article className="panel" key={view}>
      <Icon aria-hidden="true" size={26}/><h2>{title}</h2><p>{description}</p><button className="secondary" onClick={() => onNavigate(view)}>Open {title.toLowerCase()}<ArrowRight size={16} aria-hidden="true"/></button>
    </article>)}</div>
  </div>;
}
