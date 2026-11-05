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

const categories = ['All', 'Origins', 'Family and ancestry', 'Covenant', 'Worship and law'] as const;
type Category = typeof categories[number];
const layers = [
  { id: 'before-moses', title: 'Before Moses', description: 'Narrative material preceding the Moses cycle in the Torah. This is a literary grouping, not a claim that every event has a securely established modern date.', references: ['Genesis 1–11', 'Genesis 12–50'], categories: ['Origins', 'Family and ancestry'], jewish: 'The same narratives appear in the Torah within the Hebrew Bible. Jewish interpretive traditions will be added as separately sourced material.', islamic: 'Qur’anic narratives concerning creation and earlier figures require passage-by-passage mapping. No Qur’an, Hadith, or Fiqh sources are conflated here.' },
  { id: 'during-moses', title: 'During Moses', description: 'The Exodus narrative before the Sinai covenant material. Chapter groupings are navigation aids, not precise chronological dating.', references: ['Exodus 1–18'], categories: ['Family and ancestry', 'Origins'], jewish: 'The Exodus account is part of the Torah. Historical and rabbinic commentary will be identified separately from the biblical text.', islamic: 'Moses (Musa) appears in multiple Qur’anic passages. A verified passage index is still being prepared; Hadith and Fiqh remain separate collections.' },
  { id: 'law-of-moses', title: 'Law of Moses', description: 'The Torah’s covenant and legal material from Sinai through the wilderness narratives. This grouping follows the biblical text and does not assert a single scholarly date for composition.', references: ['Exodus 19–40', 'Leviticus 1–27', 'Numbers 1–36', 'Deuteronomy 1–34'], categories: ['Covenant', 'Worship and law'], jewish: 'Torah law and later Jewish legal interpretation are distinct layers. Mishnah, Talmud, and later rulings will only be shown with their own citations and dates.', islamic: 'Islamic legal traditions are not a continuation of Torah law by default. Qur’an, Hadith, and Fiqh comparisons will be presented independently and with explicit source labels.' }
] as const;


const researchEntries: Partial<Record<SectionId, { title: string; summary: string; references: string[]; caution: string }[]>> = {
  social: [
    { title: 'Justice and witness', summary: 'The legal texts address impartial judgment, truthful testimony, and protection against corrupt influence. These passages describe ancient legal norms; they are not a complete modern legal code.', references: ['Exodus 23:1–9', 'Leviticus 19:15', 'Deuteronomy 16:18–20'], caution: 'Read alongside the surrounding covenant and community context. Later Jewish and Christian legal interpretations are separate research layers.' },
    { title: 'Property and boundaries', summary: 'The texts address theft, restitution, land boundaries, and the treatment of land within a wider covenantal order.', references: ['Exodus 22:1–15', 'Leviticus 25:23–28', 'Deuteronomy 19:14'], caution: 'Ancient agrarian property rules are not identical to modern private-property law.' },
    { title: 'Slavery and servants', summary: 'Biblical legal passages regulate several forms of servitude and contain provisions that differ by status, origin, and circumstance. Their presence raises serious historical and ethical questions.', references: ['Exodus 21:1–11', 'Exodus 21:20–21', 'Leviticus 25:39–46', 'Deuteronomy 23:15–16'], caution: 'Do not flatten these passages into a claim that all forms of slavery were the same or that regulation equals abolition. Interpretations and historical conditions are debated.' },
    { title: 'Marriage and divorce', summary: 'The Torah contains provisions concerning marital obligations and divorce. These texts belong to their ancient legal setting and were interpreted in differing ways in later traditions.', references: ['Exodus 21:10–11', 'Deuteronomy 24:1–4', 'Genesis 2:24'], caution: 'The descriptive legal text, later rabbinic interpretation, and later Christian teaching must remain distinguishable.' },
    { title: 'Inheritance', summary: 'The daughters of Zelophehad bring an inheritance claim that results in a stated rule for a particular succession circumstance; a later chapter addresses tribal land concerns.', references: ['Numbers 27:1–11', 'Numbers 36:1–12', 'Deuteronomy 21:15–17'], caution: 'Read the narrative and legal outcome together; do not generalize one case into a complete account of every inheritance practice.' },
    { title: 'Punishment and restitution', summary: 'These passages include penalties, compensation, and proportionality rules for different offenses and injuries.', references: ['Exodus 21:12–36', 'Leviticus 24:17–22', 'Deuteronomy 19:16–21'], caution: 'Ancient penalties must be presented in context, not as present-day legal advice or an endorsement of applying them today.' }
  ],
  money: [
    { title: 'Possessing wealth', summary: 'Some passages acknowledge wealth and material provision while warning against treating prosperity as proof of personal merit or independence from God.', references: ['Deuteronomy 8:11–18', 'Proverbs 10:22', '1 Timothy 6:17–19'], caution: 'These texts do not promise that faithful people will become wealthy. Avoid turning descriptive statements into guaranteed outcomes.' },
    { title: 'The love of money', summary: 'The New Testament warns about desire for wealth and the damage caused by making money an ultimate priority. The warning concerns the love of money, not the mere fact of possessing it.', references: ['Ecclesiastes 5:10–20', 'Matthew 6:19–24', 'Luke 12:13–21', '1 Timothy 6:6–10'], caution: 'Read each passage in its literary setting. Do not use these texts to shame people experiencing poverty or financial hardship.' },
    { title: 'Giving, debt and responsibility', summary: 'Biblical material addresses generosity, lending, debt, and care for people in need across different genres and historical settings.', references: ['Exodus 22:25–27', 'Deuteronomy 15:7–11', 'Proverbs 22:7', '2 Corinthians 8:1–15'], caution: 'Narrative, legal instruction, wisdom sayings, and apostolic exhortation are different genres; do not collapse them into a single financial formula.' }
  ]
};
const reviewStatus = 'AI-assisted draft · human review pending';

type SectionId = typeof sections[number]['id'];

export default function LawDiary() {
  const initial = useMemo(() => {
    const parts = window.location.hash.slice(1).split('/').filter(Boolean);
    return sections.some(section => section.id === parts[1]) ? parts[1] as SectionId : 'timeline';
  }, []);
  const [active, setActive] = useState<SectionId>(initial);
  const [category, setCategory] = useState<Category>('All');
  const section = sections.find(item => item.id === active) || sections[0];
  const visibleLayers = layers.filter(layer => category === 'All' || layer.categories.includes(category as typeof layer.categories[number]));
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
    {active === 'timeline' ? <section className="law-diary-section" aria-labelledby="law-diary-section-title">
      <div className="law-diary-section-heading"><div><span className="eyebrow">TIMELINE · THREE INITIAL LAYERS</span><h2 id="law-diary-section-title">Textual timeline</h2><p>Filter by subject. These groupings follow canonical chapter ranges; they do not claim precise archaeological dates.</p></div></div>
      <div className="law-diary-filters" role="group" aria-label="Filter timeline by category">
        {categories.map(item => <button key={item} type="button" className={category === item ? 'law-diary-filter active' : 'law-diary-filter'} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="law-diary-timeline">
        {visibleLayers.map(layer => <article className="law-diary-layer" key={layer.id}>
          <div className="law-diary-layer-main"><span className="eyebrow">BIBLICAL TEXT · {layer.id.toUpperCase()}</span><h3>{layer.title}</h3><p>{layer.description}</p><div className="law-diary-reference-list">{layer.references.map(ref => <span key={ref}>{ref}</span>)}</div></div>
          <div className="law-diary-parallel-grid">
            <section><h4>Jewish textual context</h4><p>{layer.jewish}</p></section>
            <section><h4>Islamic textual context</h4><p>{layer.islamic}</p></section>
          </div>
        </article>)}
      </div>
      <p className="law-diary-honesty" role="status">Editorial status: initial chapter-range structure is present. Historical dating, Jewish commentary, and Qur’anic passage mappings remain under source review.</p>
    </section> : researchEntries[active] ? <section className="law-diary-section" aria-labelledby="law-diary-section-title">
      <div className="law-diary-section-heading"><div><span className="eyebrow">SOURCE-INDEXED STUDY · HUMAN REVIEW PENDING</span><h2 id="law-diary-section-title">{section.title}</h2><p>{section.summary}</p></div></div>
      <div className="law-diary-entry-grid">{researchEntries[active]?.map(entry => <article className="law-diary-entry" key={entry.title}>
        <span className="eyebrow">{reviewStatus}</span><h3>{entry.title}</h3><p>{entry.summary}</p>
        <h4>Primary-text references</h4><ul>{entry.references.map(ref => <li key={ref}>{ref}</li>)}</ul>
        <p className="law-diary-entry-caution"><strong>Context note:</strong> {entry.caution}</p>
        <p className="law-diary-source-note">Sources: biblical canonical text references listed above. Edition-specific quotations and human editorial approval are pending.</p>
      </article>)}</div>
      <p className="law-diary-honesty" role="status">These are AI-assisted research notes, not human-approved interpretations. Source references are provided for verification; no cross-religion relationship is inferred.</p> : <section className="law-diary-section" aria-labelledby="law-diary-section-title">
      <div className="law-diary-section-heading"><div><span className="eyebrow">SECTION IN PROGRESS</span><h2 id="law-diary-section-title">{section.title}</h2><p>{section.summary}</p></div></div>
      <ul className="law-diary-topic-list">{section.topics.map(topic => <li key={topic}><span>{topic}</span><span className="law-diary-pending">Research entry in progress</span></li>)}</ul>
      <p className="law-diary-honesty" role="status">Data for this section is being entered. No unsourced summaries or placeholder historical claims are presented as findings.</p>
      <p className="law-diary-method">Editorial method: every published entry must identify its source, distinguish primary text from later tradition, and record its AI review status. Hadith, Quran, and Fiqh are treated as separate source categories.</p>
    </section>}
  </main>;
}
