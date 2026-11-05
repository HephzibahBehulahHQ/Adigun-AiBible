import { useMemo, useState } from 'react';
import { BookOpen, Scale, Coins, MessageSquareText, Globe2, Users, Hourglass } from 'lucide-react';

const sections = [
  { id: 'timeline', title: 'Timeline', summary: 'Historical layers and chronology', icon: Hourglass, topics: ['Before Moses', 'During Moses', 'Law of Moses'] },
  { id: 'social', title: 'Social laws', summary: 'Justice, property, family and restitution', icon: Scale, topics: ['Justice and witness', 'Property and boundaries', 'Slavery and servants', 'Marriage and divorce', 'Inheritance', 'Punishment and restitution'] },
  { id: 'money', title: 'Money', summary: 'Wealth, stewardship and the love of money', icon: Coins, topics: ['Possessing wealth', 'The love of money', 'Giving and debt'] },
  { id: 'sermons', title: 'Sermons', summary: 'Major teaching collections in their contexts', icon: MessageSquareText, topics: ['Sermon on the Mount', 'Sermon on the Plain', 'The Sower', 'Olivet Discourse', 'Upper Room', 'Woes against the Pharisees', 'Nazareth'] },
  { id: 'evangelism', title: 'Evangelism', summary: 'Descriptive study of texts and historical practice', icon: Globe2, topics: ['Texts and settings', 'Audience and historical context', 'Interpretive differences'] },
  { id: 'apostles', title: 'Apostles', summary: 'Biblical record distinguished from later tradition', icon: Users, topics: ['Biblical accounts', 'Later historical traditions', 'Source confidence'] },
  { id: 'second-coming', title: 'Second Coming', summary: 'Texts and interpretations presented side by side', icon: BookOpen, topics: ['Gospel passages', 'Pauline passages', 'Revelation', 'Interpretive approaches'] }
] as const;

type SectionId = typeof sections[number]['id'];

export default function LawDiary() {
  const initial = useMemo(() => {
    const parts = window.location.hash.slice(1).split('/').filter(Boolean);
    return sections.some(section => section.id === parts[1]) ? parts[1] as SectionId : 'timeline';
  }, []);
  const [active, setActive] = useState<SectionId>(initial);
  const section = sections.find(item => item.id === active) || sections[0];
  function openSection(id: SectionId) {
    setActive(id);
    window.history.replaceState(window.history.state, '', `#/law-diary/${id}`);
  }
  return <main className="page law-diary-page">
    <div className="page-heading">
      <span className="eyebrow">SCRIPTURE OBSERVATORY · RESEARCH COLLECTION</span>
      <h1>Law Diary</h1>
      <p>A source-led study collection. Biblical text, later tradition, and modern interpretation are kept distinct. No relationship or chronology is inferred where the sources do not establish it.</p>
    </div>
    <nav className="law-diary-nav" aria-label="Law Diary sections">
      {sections.map(item => {
        const Icon = item.icon;
        return <button key={item.id} type="button" className={active === item.id ? 'law-diary-nav-item active' : 'law-diary-nav-item'} aria-current={active === item.id ? 'page' : undefined} onClick={() => openSection(item.id)}>
          <Icon size={18}/><span>{item.title}</span>
        </button>;
      })}
    </nav>
    <section className="law-diary-section" aria-labelledby="law-diary-section-title">
      <div className="law-diary-section-heading"><div><span className="eyebrow">SECTION IN PROGRESS</span><h2 id="law-diary-section-title">{section.title}</h2><p>{section.summary}</p></div></div>
      <ul className="law-diary-topic-list">{section.topics.map(topic => <li key={topic}><span>{topic}</span><span className="law-diary-pending">Research entry in progress</span></li>)}</ul>
      <p className="law-diary-honesty" role="status">Data for this section is being entered. No unsourced summaries or placeholder historical claims are presented as findings.</p>
      <p className="law-diary-method">Editorial method: every published entry must identify its source, distinguish primary text from later tradition, and record its AI review status. Hadith, Quran, and Fiqh are treated as separate source categories.</p>
    </section>
  </main>;
}
