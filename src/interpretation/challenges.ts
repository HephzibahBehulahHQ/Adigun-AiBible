import { validateChallenge } from './model.ts';

export const blindChallenge = validateChallenge({
  id: 'matthew-fulfill-law', version: 'research-2026-11-05', title: 'What does fulfillment mean? · Matthew 5:17–20',
  question: 'How does each writer connect Jesus’ fulfillment of the law with the teaching that follows? What evidence supports or challenges that reading?',
  passage: { bookId: 'MAT', chapter: 5, verse: 17, endVerse: 20 }, contextStart: 13, contextEnd: 26,
  aiReviewStatus: 'draft', humanReviewStatus: 'pending',
  diversityNotice: 'These are two historical Christian writers, not a survey of every reading. Traditions contain disagreement and develop over time. One author cannot speak for every Orthodox, Methodist, Anglican or other Christian reader; Jewish and other non-Christian readings are not represented in this exercise.',
  sources: [
    {
      id: 'reading-a', author: 'John Chrysostom', tradition: 'Greek patristic Christian tradition; received in Orthodox churches and beyond. This is his historical homily, not a current denominational declaration.',
      title: 'Homilies on the Gospel of Saint Matthew, Homily XVI', locator: 'Sections 3–5, especially the three accounts of fulfillment',
      url: 'https://www.ccel.org/ccel/schaff/npnf110.iii.XVI.html',
      edition: 'George Prevost translation (Oxford, 1843–1851), revised by M. B. Riddle, NPNF First Series, volume 10 (1888), edited by Philip Schaff; CCEL transcription. Retrieved 5 November 2026.',
      quote: 'But the law He fulfilled, not in one way only, but in a second and third also.',
      summary: 'Fulfillment has several dimensions: Christ obeys the law, enables its purpose through faith, and deepens its demands in the teaching that follows. The restriction on anger strengthens the prohibition of killing. The passage introduces a more demanding practice in continuity with the earlier law.',
      limits: ['Does the immediate context support all three senses, or is one more directly in view? Read Matthew 5:21–26 alongside the claim.', 'Section 5 connects the least commandments with what Jesus is about to command. How does that account for the preceding reference to the law? These are editorial questions, not a verdict.'],
      supporting: [
        { label: 'Romans 3:31', reference: { bookId: 'ROM', chapter: 3, verse: 31 }, reason: 'The homily cites this when linking faith and the establishment of the law (§3).' },
        { label: 'Romans 8:3–4', reference: { bookId: 'ROM', chapter: 8, verse: 3, endVerse: 4 }, reason: 'The homily invokes fulfillment in believers (§3); inspect the whole argument in context.' },
      ],
      rights: 'Short quotation of the public-domain historical translation. Prevost died in 1893, Riddle in 1916 and Schaff in 1893; the 1888 text is beyond US publication and EU life-plus-70 terms. CCEL’s modern design, introductions and added material are not imported. The draft summary is not the author’s wording.',
      rightsSources: [
        { label: 'Original translation and revision credits', url: 'https://www.ccel.org/ccel/schaff/npnf110.iii.i.html' },
        { label: '1888 editor’s preface and edition history', url: 'https://www.ccel.org/ccel/schaff/npnf110.ii.html' },
        { label: 'Prevost’s dates and translation bibliography', url: 'https://en.wikisource.org/wiki/Dictionary_of_National_Biography,_1885-1900/Prevost,_George_(1804-1893)' },
        { label: 'Yale archival catalog: Riddle’s dates', url: 'https://ead-pdfs.library.yale.edu/5714.pdf' },
        { label: 'Schaff’s dates', url: 'https://www.ccel.org/ccel/schaff/npnf110.html' },
        { label: 'Orthodox reception and author context', url: 'https://www.oca.org/orthodoxy/the-orthodox-faith/church-history/fourth-century/saint-john-chrysostom' },
        { label: 'EU copyright term, Article 1', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0116' },
        { label: 'CCEL site and special-content policy', url: 'https://www.ccel.org/about/copyright.html' },
      ],
      sourceSha256: 'c461aeeabf38914d304db54f432ab26c360c3a65f3d32ef7b30ea4c0208b264a',
    },
    {
      id: 'reading-b', author: 'John Wesley', tradition: 'Wesleyan / Methodist historical preaching. Wesley’s association with Methodism does not make every present Methodist reader agree with every point of this sermon.',
      title: 'Upon our Lord’s Sermon on the Mount, Discourse 5 (Sermon 25)', locator: 'I.1–4 and II.1–3',
      url: 'https://www.ccel.org/ccel/wesley/sermons.v.xxv.html',
      edition: 'English text of the 1872 edition, as identified by CCEL. Wesley wrote in English; no modern translation is used. Retrieved 5 November 2026.',
      quote: 'I am come to establish it in its fullness, in spite of all the glosses of men',
      summary: 'This reading distinguishes temporary ceremonial law from enduring moral law. In this sermon, fulfillment primarily means making the moral law’s full meaning clear. Christ’s perfect obedience is acknowledged, but the writer argues that it is not the main meaning of this verse in its immediate setting.',
      limits: ['Does the passage itself mark the proposed distinction between ceremonial and moral law, or does the argument depend on other passages?', 'The writer accepts Christ’s obedience but gives explanatory fulfillment priority here. Test that priority against verses 18–20 and the following examples. These are editorial questions, not a verdict.'],
      supporting: [
        { label: 'Acts 15:5', reference: { bookId: 'ACT', chapter: 15, verse: 5 }, reason: 'The sermon cites the dispute about requiring the law of Moses in support of its ritual-law distinction (I.1).' },
        { label: 'Acts 15:22–29', reference: { bookId: 'ACT', chapter: 15, verse: 22, endVerse: 29 }, reason: 'The sermon appeals to the council’s letter (I.1). Read its actual demands, audience and limits.' },
      ],
      rights: 'Short quotation from Wesley’s public-domain English sermon in the identified 1872 edition. Wesley died in 1791; the historical wording is beyond US publication and EU life-plus-70 terms. CCEL’s modern website and added introductions are not imported. The draft summary is not Wesley’s wording.',
      rightsSources: [
        { label: 'Source text and 1872 edition note', url: 'https://www.ccel.org/ccel/wesley/sermons.v.xxv.html' },
        { label: 'Author dates and collection information', url: 'https://www.ccel.org/ccel/wesley/sermons.html' },
        { label: 'Methodist Church: Wesley and diversity within Methodism', url: 'https://www.methodist.org.uk/about/history/' },
        { label: 'EU copyright term, Article 1', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0116' },
        { label: 'CCEL site and special-content policy', url: 'https://www.ccel.org/about/copyright.html' },
      ],
      sourceSha256: 'd4c64439e01e304c5a574734620a71f8e9f85f4aaf0fb3118ef0132a5ac04365',
    },
  ],
});
