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
      edition: 'George Prevost English translation, revised with notes by M. B. Riddle; NPNF First Series, volume 10, edited by Philip Schaff; CCEL transcription. Source checked 5 November 2026.',
      quote: 'But the law He fulfilled, not in one way only, but in a second and third also.',
      summary: 'Fulfillment has several dimensions: Christ obeys the law, enables its purpose through faith, and deepens its demands in the teaching that follows. The restriction on anger strengthens the prohibition of killing. The passage introduces a more demanding practice in continuity with the earlier law.',
      limits: ['Does the immediate context support all three senses, or is one more directly in view? Read Matthew 5:21–26 alongside the claim.', 'Section 5 connects the least commandments with what Jesus is about to command. How does that account for the preceding reference to the law? These are editorial questions, not a verdict.'],
      supporting: [
        { label: 'Romans 3:31', reference: { bookId: 'ROM', chapter: 3, verse: 31 }, reason: 'The homily cites this when linking faith and the establishment of the law (§3).' },
        { label: 'Romans 8:3–4', reference: { bookId: 'ROM', chapter: 8, verse: 3, endVerse: 4 }, reason: 'The homily invokes fulfillment in believers (§3); inspect the whole argument in context.' },
      ],
      rights: 'Only this brief historical translation excerpt is reproduced for the exercise. Full works, modern CCEL introductions and site assets are not imported. The linked source retains its publisher notices; no full-work redistribution permission is claimed. The AI-assisted summary is separate from the source quotation.',
      rightsSources: [
        { label: 'Original translation and revision credits', url: 'https://www.ccel.org/ccel/schaff/npnf110.iii.i.html' },
        { label: '1888 editor’s preface and edition history', url: 'https://www.ccel.org/ccel/schaff/npnf110.ii.html' },
        { label: 'Orthodox reception and author context', url: 'https://www.oca.org/orthodoxy/the-orthodox-faith/church-history/fourth-century/saint-john-chrysostom' },
        { label: 'CCEL site and special-content policy', url: 'https://www.ccel.org/about/copyright.html' },
      ],
      sourceSha256: '369577cdc80020ca7004dd59eafc0bb6bc10c0f6bfaf75a34d586060dc31cb11',
    },
    {
      id: 'reading-b', author: 'John Wesley', tradition: 'Wesleyan / Methodist historical preaching. Wesley’s association with Methodism does not make every present Methodist reader agree with every point of this sermon.',
      title: 'Upon our Lord’s Sermon on the Mount, Discourse 5 (Sermon 25)', locator: 'I.1–4 and II.1–3',
      url: 'https://www.ccel.org/ccel/wesley/sermons.v.xxv.html',
      edition: 'English text of the 1872 edition, as identified by CCEL. Source checked 5 November 2026.',
      quote: 'I am come to establish it in its fullness, in spite of all the glosses of men',
      summary: 'This reading distinguishes temporary ceremonial law from enduring moral law. In this sermon, fulfillment primarily means making the moral law’s full meaning clear. Christ’s perfect obedience is acknowledged, but the writer argues that it is not the main meaning of this verse in its immediate setting.',
      limits: ['Does the passage itself mark the proposed distinction between ceremonial and moral law, or does the argument depend on other passages?', 'The writer accepts Christ’s obedience but gives explanatory fulfillment priority here. Test that priority against verses 18–20 and the following examples. These are editorial questions, not a verdict.'],
      supporting: [
        { label: 'Acts 15:5', reference: { bookId: 'ACT', chapter: 15, verse: 5 }, reason: 'The sermon cites the dispute about requiring the law of Moses in support of its ritual-law distinction (I.1).' },
        { label: 'Acts 15:22–29', reference: { bookId: 'ACT', chapter: 15, verse: 22, endVerse: 29 }, reason: 'The sermon appeals to the council’s letter (I.1). Read its actual demands, audience and limits.' },
      ],
      rights: 'Only this brief historical sermon excerpt is reproduced for the exercise. Full works, modern CCEL introductions and site assets are not imported. The linked source retains its publisher notices; no full-work redistribution permission is claimed. The AI-assisted summary is separate from the source quotation.',
      rightsSources: [
        { label: 'Source text and 1872 edition note', url: 'https://www.ccel.org/ccel/wesley/sermons.v.xxv.html' },
        { label: 'Methodist Church: Wesley and diversity within Methodism', url: 'https://www.methodist.org.uk/about/history/' },
        { label: 'CCEL site and special-content policy', url: 'https://www.ccel.org/about/copyright.html' },
      ],
      sourceSha256: '62fd7b6d2a74a9a364bdce53a2ea0d8c903b49f413b2d90e29e6d656fc9c786a',
    },
  ],
});
