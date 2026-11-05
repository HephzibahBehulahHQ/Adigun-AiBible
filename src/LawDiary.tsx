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


type ResearchDraft = { title: string; summary: string; references: string[]; caution: string; aiReviewStatus: string; sources: { type: 'biblical_text'; reference: string }[] };
const withProvenance = (entry: { title: string; summary: string; references: string[]; caution: string }): ResearchDraft => ({
  ...entry,
  aiReviewStatus: 'AI-assisted draft · human review pending',
  sources: entry.references.map(reference => ({ type: 'biblical_text', reference }))
});
const researchEntries: Partial<Record<SectionId, ResearchDraft[]>> = {
  social: ([
    { title: 'Justice and witness', summary: 'The legal texts address impartial judgment, truthful testimony, and protection against corrupt influence. These passages describe ancient legal norms; they are not a complete modern legal code.', references: ['Exodus 23:1–9', 'Leviticus 19:15', 'Deuteronomy 16:18–20'], caution: 'Read alongside the surrounding covenant and community context. Later Jewish and Christian legal interpretations are separate research layers.' },
    { title: 'Property and boundaries', summary: 'The texts address theft, restitution, land boundaries, and the treatment of land within a wider covenantal order.', references: ['Exodus 22:1–15', 'Leviticus 25:23–28', 'Deuteronomy 19:14'], caution: 'Ancient agrarian property rules are not identical to modern private-property law.' },
    { title: 'Slavery and servants', summary: 'Biblical legal passages regulate several forms of servitude and contain provisions that differ by status, origin, and circumstance. Their presence raises serious historical and ethical questions.', references: ['Exodus 21:1–11', 'Exodus 21:20–21', 'Leviticus 25:39–46', 'Deuteronomy 23:15–16'], caution: 'Do not flatten these passages into a claim that all forms of slavery were the same or that regulation equals abolition. Interpretations and historical conditions are debated.' },
    { title: 'Marriage and divorce', summary: 'The Torah contains provisions concerning marital obligations and divorce. These texts belong to their ancient legal setting and were interpreted in differing ways in later traditions.', references: ['Exodus 21:10–11', 'Deuteronomy 24:1–4', 'Genesis 2:24'], caution: 'The descriptive legal text, later rabbinic interpretation, and later Christian teaching must remain distinguishable.' },
    { title: 'Inheritance', summary: 'The daughters of Zelophehad bring an inheritance claim that results in a stated rule for a particular succession circumstance; a later chapter addresses tribal land concerns.', references: ['Numbers 27:1–11', 'Numbers 36:1–12', 'Deuteronomy 21:15–17'], caution: 'Read the narrative and legal outcome together; do not generalize one case into a complete account of every inheritance practice.' },
    { title: 'Punishment and restitution', summary: 'These passages include penalties, compensation, and proportionality rules for different offenses and injuries.', references: ['Exodus 21:12–36', 'Leviticus 24:17–22', 'Deuteronomy 19:16–21'], caution: 'Ancient penalties must be presented in context, not as present-day legal advice or an endorsement of applying them today.' }
  ]).map(withProvenance),
  sermons: ([
    { title: 'Sermon on the Mount', summary: 'Matthew presents an extended collection of Jesus’ teaching on the mountain, including the Beatitudes, ethical instruction, prayer, and warnings about practice. The traditional title is a heading for Matthew’s literary presentation.', references: ['Matthew 5:1–7:29'], caution: 'Read the complete discourse and its narrative setting. Do not assume it is identical in setting or structure to Luke’s Sermon on the Plain.' },
    { title: 'Sermon on the Plain', summary: 'Luke presents teaching after Jesus comes down and stands on a level place. The passage includes blessings and woes, love of enemies, judgment, and the image of foundations.', references: ['Luke 6:17–49'], caution: 'Similar themes occur in Matthew, but the two Gospel presentations should be compared rather than silently harmonized.' },
    { title: 'The Sower', summary: 'The parable and its explanation appear in the Synoptic Gospels, with differences in surrounding narrative and wording. The seed and soils imagery is interpreted within each Gospel’s account.', references: ['Matthew 13:1–23', 'Mark 4:1–20', 'Luke 8:4–15'], caution: 'Keep each Gospel’s version visible. Do not treat a blended retelling as a direct quotation from any one Gospel.' },
    { title: 'Olivet Discourse', summary: 'This traditional label refers to Jesus’ teaching associated with the Mount of Olives about the temple, coming troubles, watchfulness, and the coming of the Son of Man.', references: ['Matthew 24:1–25:46', 'Mark 13:1–37', 'Luke 21:5–36'], caution: 'Interpretations of chronology and fulfillment are debated. Present major readings side by side; do not claim a single uncontested timeline.' },
    { title: 'Upper Room discourse', summary: 'John 13–17 presents teaching and prayer in the setting of Jesus’ final meal with his disciples, including service, departure, the Advocate, abiding, and unity.', references: ['John 13:1–17:26'], caution: 'The label is a traditional study heading. Keep John’s account distinct from the Synoptic meal narratives.' },
    { title: 'Woes against the Pharisees', summary: 'Matthew and Luke preserve rebukes and woes in different narrative settings. The texts criticize particular forms of hypocrisy and leadership failure; they must not be generalized into hostility toward Jewish people.', references: ['Matthew 23:1–39', 'Luke 11:37–54'], caution: 'Attend to each Gospel’s audience and setting. Avoid anti-Jewish readings and distinguish criticism of specific leaders from claims about an entire people.' },
    { title: 'Nazareth synagogue', summary: 'Luke narrates Jesus reading from Isaiah in the synagogue at Nazareth and the reaction that follows. The episode is a narrative scene rather than a sermon transcript with a full outline.', references: ['Luke 4:16–30'], caution: 'Keep Luke’s narrative sequence and the cited prophetic text in view; do not add details absent from the passage.' }
  ]).map(withProvenance),
  money: ([
    { title: 'Possessing wealth', summary: 'Some passages acknowledge wealth and material provision while warning against treating prosperity as proof of personal merit or independence from God.', references: ['Deuteronomy 8:11–18', 'Proverbs 10:22', '1 Timothy 6:17–19'], caution: 'These texts do not promise that faithful people will become wealthy. Avoid turning descriptive statements into guaranteed outcomes.' },
    { title: 'The love of money', summary: 'The New Testament warns about desire for wealth and the damage caused by making money an ultimate priority. The warning concerns the love of money, not the mere fact of possessing it.', references: ['Ecclesiastes 5:10–20', 'Matthew 6:19–24', 'Luke 12:13–21', '1 Timothy 6:6–10'], caution: 'Read each passage in its literary setting. Do not use these texts to shame people experiencing poverty or financial hardship.' },
    { title: 'Giving, debt and responsibility', summary: 'Biblical material addresses generosity, lending, debt, and care for people in need across different genres and historical settings.', references: ['Exodus 22:25–27', 'Deuteronomy 15:7–11', 'Proverbs 22:7', '2 Corinthians 8:1–15'], caution: 'Narrative, legal instruction, wisdom sayings, and apostolic exhortation are different genres; do not collapse them into a single financial formula.' }
  ]).map(withProvenance),
  evangelism: ([
    { title: 'Commission passages in the Gospels and Acts', summary: 'Matthew, Luke, and Acts preserve distinct concluding scenes and commission language. Their narrative settings and emphases should be read in their own literary contexts.', references: ['Matthew 28:16–20', 'Luke 24:44–53', 'Acts 1:1–11'], caution: 'This is a descriptive index of ancient texts, not a set of instructions for targeting, pressuring, or converting people. The accounts are not interchangeable.' },
    { title: 'Public speeches in Acts', summary: 'Acts depicts speeches in synagogues, public spaces, and legal settings, with arguments shaped by the audience and narrative situation.', references: ['Acts 13:16–41', 'Acts 17:16–34', 'Acts 26:1–29'], caution: 'Luke’s literary presentation is the source being indexed. Do not assume every speech is a verbatim transcript or universal communication template.' },
    { title: 'Households and urban settings', summary: 'The narrative of Acts places early Jesus-movement activity in homes, marketplaces, synagogues, and civic settings across several cities.', references: ['Acts 16:11–40', 'Acts 17:1–15', 'Acts 18:1–11'], caution: 'These are narrative descriptions of particular ancient settings, not permission to intrude into private spaces or disregard another person’s boundaries.' }
  ]).map(withProvenance),
  apostles: ([
    { title: 'Lists of the Twelve', summary: 'The Synoptic Gospels preserve lists of the Twelve, with differences in ordering and some names. These lists should be compared in parallel rather than silently harmonized.', references: ['Matthew 10:1–4', 'Mark 3:13–19', 'Luke 6:12–16'], caution: 'The lists identify the named group in each Gospel; they do not provide a complete biography or death account for every apostle.' },
    { title: 'James son of Zebedee', summary: 'Acts explicitly reports that Herod killed James, the brother of John, with the sword. This is the clearest death account of one of the Twelve in the New Testament.', references: ['Mark 1:19–20', 'Acts 12:1–2'], caution: 'Keep the biblical report distinct from later traditions about other apostles. Do not transfer James’s recorded fate to the others.' },
    { title: 'Peter and Paul in the New Testament record', summary: 'The New Testament contains substantial accounts of Peter and Paul’s activity, but Acts ends with Paul alive under house arrest and does not narrate either apostle’s death.', references: ['Acts 12:1–19', 'Acts 28:16–31', '2 Peter 1:12–15', '2 Timothy 4:6–8'], caution: 'Later accounts of their deaths belong to separate historical-tradition research and require their own dated sources; these passages alone do not establish the traditional execution narratives.' }
  ]).map(withProvenance),
  'second-coming': ([
    { title: 'Synoptic teaching about the coming of the Son of Man', summary: 'Matthew, Mark, and Luke preserve related but distinct teachings about the temple, tribulation, watchfulness, and the coming of the Son of Man.', references: ['Matthew 24:1–44', 'Mark 13:1–37', 'Luke 21:5–36'], caution: 'Chronology, fulfillment, and the relationship between near and future horizons are debated. Keep each Gospel’s wording visible and avoid presenting one timeline as uncontested.' },
    { title: 'Pauline passages on resurrection and expectation', summary: 'Pauline letters discuss resurrection, the coming of the Lord, hope, and ethical readiness in pastoral and community settings.', references: ['1 Thessalonians 4:13–18', '1 Thessalonians 5:1–11', '1 Corinthians 15:12–58', '2 Thessalonians 2:1–12'], caution: 'These passages address different questions and audiences. Interpretive disagreements about sequence and timing should be identified rather than harmonized away.' },
    { title: 'Revelation’s visions and final renewal', summary: 'Revelation uses apocalyptic visions and symbolic imagery to portray judgment, conflict, and the new heaven and new earth.', references: ['Revelation 19:11–21', 'Revelation 20:1–15', 'Revelation 21:1–22:5'], caution: 'Genre matters: symbolic imagery has generated multiple interpretive approaches. Do not treat every image as a literal timetable or claim consensus where none exists.' },
    { title: 'Interpretive approaches and disputed sequences', summary: 'Readers have developed differing approaches to the millennium, tribulation, resurrection, and fulfillment of prophetic texts.', references: ['Revelation 20:1–10', 'Daniel 7:9–14', 'Matthew 24:29–31', '1 Corinthians 15:20–28'], caution: 'This reference set identifies texts discussed in these debates; it does not prove a single system. Historical labels and representative interpreters require additional dated sources before publication.' }
  ]).map(withProvenance)
};
 
type SectionId = typeof sections[number]['id'];

export default function LawDiary() {
  const initial = useMemo(() => {
    const parts = window.location.hash.slice(1).split('/').filter(Boolean);
    return sections.some(section => section.id === parts[1]) ? parts[1] as SectionId : 'timeline';
  }, []);
  const [active, setActive] = useState<SectionId>(initial);
  const [category, setCategory] = useState<Category>('All');
  const section = sections.find(item => item.id === active) || sections[0];
  const visibleLayers = layers.filter(layer => category === 'All' || layer.categories.some(value => value === category));
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
        <span className="eyebrow">{entry.aiReviewStatus}</span><h3>{entry.title}</h3><p>{entry.summary}</p>
        <h4>Primary-text references</h4><ul>{entry.references.map(ref => <li key={ref}>{ref}</li>)}</ul>
        <p className="law-diary-entry-caution"><strong>Context note:</strong> {entry.caution}</p>
        <p className="law-diary-source-note">Sources: {entry.sources.map(source => `${source.type}: ${source.reference}`).join('; ')}. Edition-specific quotations and human editorial approval are pending.</p>
      </article>)}</div>
      <p className="law-diary-honesty" role="status">These are AI-assisted research notes, not human-approved interpretations. Source references are provided for verification; no cross-religion relationship is inferred.</p>
    </section> : <section className="law-diary-section" aria-labelledby="law-diary-section-title">
      <div className="law-diary-section-heading"><div><span className="eyebrow">SECTION IN PROGRESS</span><h2 id="law-diary-section-title">{section.title}</h2><p>{section.summary}</p></div></div>
      <ul className="law-diary-topic-list">{section.topics.map(topic => <li key={topic}><span>{topic}</span><span className="law-diary-pending">Research entry in progress</span></li>)}</ul>
      <p className="law-diary-honesty" role="status">Data for this section is being entered. No unsourced summaries or placeholder historical claims are presented as findings.</p>
      <p className="law-diary-method">Editorial method: every published entry must identify its source, distinguish primary text from later tradition, and record its AI review status. Hadith, Quran, and Fiqh are treated as separate source categories.</p>
    </section>}
  </main>;
}
