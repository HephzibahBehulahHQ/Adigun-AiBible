#!/usr/bin/env python3
"""Import pinned publisher Bible/Quran editions without rewriting source wording.

Raw archives are kept outside the repository. Imports fail on changed/truncated
downloads, unexpected markup, duplicate references, or XML/plain-text disagreement.
"""
from __future__ import annotations

import argparse
from collections import OrderedDict
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'data' / 'editions'
OBSERVED_ON = '2026-11-03'
MAX_ARCHIVE_BYTES = 20_000_000
MAX_MEMBER_BYTES = 20_000_000
ASCII_PADDING = ' \t\r\n'
BOOKS = [
    ('GEN', 'Genesis'), ('EXO', 'Exodus'), ('LEV', 'Leviticus'), ('NUM', 'Numbers'), ('DEU', 'Deuteronomy'),
    ('JOS', 'Joshua'), ('JDG', 'Judges'), ('RUT', 'Ruth'), ('1SA', '1 Samuel'), ('2SA', '2 Samuel'),
    ('1KI', '1 Kings'), ('2KI', '2 Kings'), ('1CH', '1 Chronicles'), ('2CH', '2 Chronicles'), ('EZR', 'Ezra'),
    ('NEH', 'Nehemiah'), ('EST', 'Esther'), ('JOB', 'Job'), ('PSA', 'Psalms'), ('PRO', 'Proverbs'),
    ('ECC', 'Ecclesiastes'), ('SNG', 'Song of Solomon'), ('ISA', 'Isaiah'), ('JER', 'Jeremiah'), ('LAM', 'Lamentations'),
    ('EZK', 'Ezekiel'), ('DAN', 'Daniel'), ('HOS', 'Hosea'), ('JOL', 'Joel'), ('AMO', 'Amos'),
    ('OBA', 'Obadiah'), ('JON', 'Jonah'), ('MIC', 'Micah'), ('NAM', 'Nahum'), ('HAB', 'Habakkuk'),
    ('ZEP', 'Zephaniah'), ('HAG', 'Haggai'), ('ZEC', 'Zechariah'), ('MAL', 'Malachi'), ('MAT', 'Matthew'),
    ('MRK', 'Mark'), ('LUK', 'Luke'), ('JHN', 'John'), ('ACT', 'Acts'), ('ROM', 'Romans'),
    ('1CO', '1 Corinthians'), ('2CO', '2 Corinthians'), ('GAL', 'Galatians'), ('EPH', 'Ephesians'), ('PHP', 'Philippians'),
    ('COL', 'Colossians'), ('1TH', '1 Thessalonians'), ('2TH', '2 Thessalonians'), ('1TI', '1 Timothy'), ('2TI', '2 Timothy'),
    ('TIT', 'Titus'), ('PHM', 'Philemon'), ('HEB', 'Hebrews'), ('JAS', 'James'), ('1PE', '1 Peter'),
    ('2PE', '2 Peter'), ('1JN', '1 John'), ('2JN', '2 John'), ('3JN', '3 John'), ('JUD', 'Jude'), ('REV', 'Revelation'),
]
TEXT_IDS = {'SOL': 'SNG', 'EZE': 'EZK', 'JOE': 'JOL', 'NAH': 'NAM', 'MAR': 'MRK', 'JOH': 'JHN',
            'PHI': 'PHP', 'JAM': 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN'}
SOURCES = {
    'deu1912': {
        'name': 'Lutherbibel 1912', 'language': 'de', 'corpus': 'bible', 'publisher': 'eBible.org',
        'translator': 'Martin Luther; 1912 revision', 'sourceUpdatedAt': '2025-12-29',
        'sourceUrl': 'https://ebible.org/deu1912/',
        'formatUrl': 'https://ebible.org/find/details.php?id=deu1912',
        'downloadUrl': 'https://ebible.org/Scriptures/deu1912_vpl.zip',
        'licenseUrl': 'https://ebible.org/deu1912/copyright.htm', 'license': 'Public domain',
        'licenseIdentifier': 'LicenseRef-Public-Domain',
        'attribution': 'Lutherbibel 1912. Martin Luther; 1912 revision. Public domain. Source: eBible.org.',
        'sha256': 'af668fb39d9c96ceddc3af69cb22db809770d09e7999012aacdaedf85eb5de16',
        'xmlSha256': 'aef32e66031a8e9c08aed65a8100bd4e877640b1352a7416c4c6647118230a11',
        'textSha256': 'f6723776717b2e18e53dc81b0b7758aeb6ce969aee9cfb432d9b61006fa13dff',
        'noticeSha256': '9e86f38ca04836ef1540ecb9d8d5dac565ce7e86ce62813e3621d094a0ca6767',
        'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
        'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
        'conditions': ['Retain accurate edition/source identity.', 'Public-domain status applies to this 1912 text, not modern Luther revisions.'],
    },
    'yor': {
        'name': 'Biblica® Open Yoruba Contemporary Bible™', 'language': 'yo', 'corpus': 'bible',
        'publisher': 'Biblica, Inc.; distributed by eBible.org', 'translator': 'Biblica, Inc.',
        'sourceUpdatedAt': '2025-06-25', 'sourceUrl': 'https://ebible.org/yor/',
        'formatUrl': 'https://ebible.org/find/details.php?id=yor',
        'downloadUrl': 'https://ebible.org/Scriptures/yor_vpl.zip',
        'licenseUrl': 'https://ebible.org/yor/copyright.htm', 'license': 'CC BY-SA 4.0',
        'licenseIdentifier': 'CC-BY-SA-4.0', 'licenseDeedUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'attribution': 'Biblica® Open Yoruba Contemporary Bible™. Copyright © 2009, 2017 by Biblica, Inc. CC BY-SA 4.0. Unmodified source text; full notice accompanies this edition.',
        'sha256': 'afa5abe34101cd7ce7a49f7c45d8d34449721a3eafe8f20dd7a1acee543ed00b',
        'xmlSha256': '60295776c127ff4219058735feb2cf6842b570ed665e1df7fe7fe77cce1b3274',
        'textSha256': '1b1392a2eb8db604dd73f222e3b9e50937c3f9b38fa221a442c08bb6034d5dff',
        'noticeSha256': '734878c78418c57309c9d88f2751bae051a4f8a0a0adc043415697c5ad874c9a',
        'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31087},
        'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
        'conditions': [
            'Include the complete publisher copyright/source notice and CC BY-SA 4.0 license.',
            'Keep Biblica trademarks intact for unchanged copies; do not imply publisher endorsement.',
            'For derivatives, remove the Biblica trademark, disclose changes, apply the prescribed attribution, and use CC BY-SA 4.0.',
            'This text license does not grant unrelated photographs, maps, or third-party recorded audio rights.',
        ],
    },
    'eng-clearquran': {
        'name': 'ClearQuran — Allah Edition', 'language': 'en', 'corpus': 'quran',
        'publisher': 'ClearQuran', 'translator': 'Talal Itani', 'sourceUpdatedAt': '2026-10-09',
        'sourceUrl': 'https://clearquran.com/', 'formatUrl': 'https://clearquran.com/download/',
        'downloadUrl': 'https://d.clearquran.com/text/clearquran-txt-allah-edition.zip',
        'licenseUrl': 'https://clearquran.com/download/', 'license': 'CC BY-ND 4.0 with publisher formatting permissions',
        'licenseIdentifier': 'CC-BY-ND-4.0', 'licenseDeedUrl': 'https://creativecommons.org/licenses/by-nd/4.0/',
        'attribution': 'Translation by Talal Itani, ClearQuran.com (Allah Edition). CC BY-ND 4.0. Wording unchanged.',
        'sha256': '3ca939fee6186ce06db165df29dfa2b8e66179c198f41c4924bc2e15be725876',
        'textSha256': '138b00041d6013f2dd96e84038529044da53748e8c534942af37edd2a4ca3eb5',
        'expectedTotals': {'surahs': 114, 'verses': 6236},
        'rights': {'redistribute': True, 'adapt': False, 'offline': True, 'audio': True, 'export': True},
        'conditions': [
            'Credit Translation by Talal Itani, ClearQuran.com and include the license; link to https://clearquran.com where possible.',
            'Commercial use, storage, format conversion, selecting exact verses, and combining unchanged quotations with other content are expressly permitted.',
            'Do not change, add, or remove translation words; semantic paraphrase/adaptation is not licensed.',
            'The publisher download-page terms supersede old noncommercial readme notices; this pinned archive already states CC BY-ND 4.0.',
            'Only text is imported here; no recorded audio files are included.',
        ],
    },
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def edition_metadata(edition_id):
    source = SOURCES[edition_id]
    fields = ('name', 'language', 'corpus', 'publisher', 'translator', 'sourceUpdatedAt', 'sourceUrl', 'formatUrl',
              'downloadUrl', 'licenseUrl', 'license', 'licenseIdentifier', 'licenseDeedUrl', 'attribution', 'sha256', 'rights', 'conditions')
    value = {'id': edition_id, **{key: source[key] for key in fields if key in source}}
    value.update({'rightsObservedAt': OBSERVED_ON, 'commercialUse': True,
                  'referenceSystemId': f'{edition_id}:publisher-numbering',
                  'noticePath': f'{edition_id}/NOTICE.txt', 'manifestPath': f'{edition_id}/manifest.json',
                  'totals': source['expectedTotals']})
    if source['corpus'] == 'bible':
        value.update({'booksPath': f'{edition_id}/books/', 'searchIndexPath': f'{edition_id}/search-index.json'})
    else:
        value['quranPath'] = f'{edition_id}/quran.json'
    return value


class NoticeText(HTMLParser):
    """Extract publisher notice text, never execute or render its HTML."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.excluded = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.excluded += 1
        if not self.excluded and tag in ('p', 'br', 'div', 'li', 'h1', 'h2', 'h3', 'hr'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.excluded:
            self.excluded -= 1
        if not self.excluded and tag in ('p', 'div', 'li', 'h1', 'h2', 'h3'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.excluded:
            self.parts.append(data)

    def text(self):
        # This affects the notice layout only, never scripture display text.
        return '\n'.join(line.strip() for line in ''.join(self.parts).splitlines() if line.strip()) + '\n'


def archive_bytes(edition_id, source_dir, download=False):
    source_dir = source_dir.resolve()
    if source_dir.is_relative_to(ROOT):
        raise ValueError('Keep raw source archives outside the Git repository.')
    path = source_dir / f'{edition_id}.zip'
    source = SOURCES[edition_id]
    if not path.exists():
        if not download:
            raise ValueError(f'Missing {path}; use --download or supply the pinned archive.')
        source_dir.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(source['downloadUrl'], headers={
            'User-Agent': 'Adigun-AiBible source importer/0.1', 'Accept-Encoding': 'identity'})
        parts, count = [], 0
        with urllib.request.urlopen(request, timeout=45) as response:
            expected = int(response.headers['Content-Length']) if response.headers.get('Content-Length') else None
            while chunk := response.read(128 * 1024):
                count += len(chunk)
                if count > MAX_ARCHIVE_BYTES:
                    raise ValueError('Archive exceeds the 20 MB download limit.')
                parts.append(chunk)
        if expected is not None and count != expected:
            raise ValueError(f'Truncated download: received {count} of {expected} bytes.')
        raw = b''.join(parts)
        if sha(raw) != source['sha256']:
            raise ValueError(f'{edition_id}: downloaded archive differs from the pinned source; review the publisher update.')
        path.write_bytes(raw)
    if path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError('Archive exceeds the 20 MB input limit.')
    raw = path.read_bytes()
    if sha(raw) != source['sha256']:
        raise ValueError(f'{edition_id}: archive checksum mismatch; no output changed.')
    return raw


def member(archive, name, expected_sha=None):
    info = archive.getinfo(name)
    if info.file_size > MAX_MEMBER_BYTES or info.is_dir():
        raise ValueError(f'Unexpected archive member: {name}')
    raw = archive.read(name)  # zipfile verifies the member CRC.
    if expected_sha and sha(raw) != expected_sha:
        raise ValueError(f'Archive member checksum mismatch: {name}')
    return raw


def valid_text(text):
    return '\ufffd' not in text and not any(ord(c) < 32 and c not in '\t\n\r' for c in text)


def bible_artifacts(edition_id, archive):
    source = SOURCES[edition_id]
    xml_name, text_name, notice_name = (f'{edition_id}_{suffix}' for suffix in ('vpl.xml', 'vpl.txt', 'about.htm'))
    xml = member(archive, xml_name, source['xmlSha256'])
    plain = member(archive, text_name, source['textSha256'])
    notice = member(archive, notice_name, source['noticeSha256'])
    if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml:
        raise ValueError('External/entity declarations are not accepted in source XML.')
    document = ET.fromstring(xml)
    if document.tag != 'verseFile':
        raise ValueError('Unexpected publisher XML root.')
    books = OrderedDict((bid, {'id': bid, 'name': name, 'chapters': []}) for bid, name in BOOKS)
    rows, seen_book_order = [], []
    for verse in document:
        if verse.tag != 'v' or len(verse) or set(verse.attrib) != {'b', 'c', 'v'}:
            raise ValueError('Unexpected XML structure; source review is required.')
        bid, chapter_label, verse_label = (verse.attrib[key] for key in ('b', 'c', 'v'))
        if bid not in books or not re.fullmatch(r'[1-9]\d*', chapter_label) or not re.fullmatch(r'[1-9]\d*', verse_label):
            raise ValueError(f'Unsupported publisher reference: {verse.attrib}')
        chapter, number = int(chapter_label), int(verse_label)
        text = (verse.text or '').strip(ASCII_PADDING)
        if not valid_text(text):
            raise ValueError(f'Invalid source characters at {bid} {chapter}:{number}')
        if not seen_book_order or seen_book_order[-1] != bid:
            if bid in seen_book_order:
                raise ValueError(f'Noncontiguous source book: {bid}')
            seen_book_order.append(bid)
        chapters = books[bid]['chapters']
        if chapter == len(chapters) + 1:
            chapters.append({'number': chapter, 'verses': []})
        if chapter != len(chapters) or (chapters[-1]['verses'] and number <= chapters[-1]['verses'][-1]['number']):
            raise ValueError(f'Duplicate/out-of-order reference: {bid} {chapter}:{number}')
        chapters[-1]['verses'].append({'number': number, 'text': text})
        rows.append({'bookId': bid, 'chapter': chapter, 'verse': number, 'text': text, 'editionId': edition_id})
    if seen_book_order != list(books):
        raise ValueError('The publisher export must contain all 66 canonical books in order.')
    independent_rows = []
    for line in plain.decode('utf-8-sig').splitlines():
        match = re.fullmatch(r'([A-Z0-9]{3}) (\d+):(\d+) (.*)', line)
        if not match:
            raise ValueError('Unexpected publisher VPL text line.')
        bid, chapter, number, text = match.groups()
        independent_rows.append({'bookId': TEXT_IDS.get(bid, bid), 'chapter': int(chapter), 'verse': int(number),
                                 'text': text.strip(ASCII_PADDING), 'editionId': edition_id})
    formatting_differences = []
    if len(rows) != len(independent_rows):
        raise ValueError('Publisher XML and plain-text exports have different reference counts.')
    for xml_row, text_row in zip(rows, independent_rows):
        if {key: value for key, value in xml_row.items() if key != 'text'} != {key: value for key, value in text_row.items() if key != 'text'}:
            raise ValueError('Publisher XML and plain-text references disagree.')
        if xml_row['text'] == text_row['text']:
            continue
        marker_pattern = r'\[([1-9]\d*(?::[1-9]\d*)?[a-z]?)\]'
        markers = list(re.finditer(marker_pattern, text_row['text']))
        comparison_text = re.sub(marker_pattern, r'\1', text_row['text']) if markers else None
        if edition_id != 'deu1912' or comparison_text != xml_row['text']:
            raise ValueError('Publisher exports disagree beyond the pinned numbering-marker format exception.')
        formatting_differences.append({'bookId': text_row['bookId'], 'chapter': text_row['chapter'],
                                       'verse': text_row['verse'], 'publisherMarkers': [marker[0] for marker in markers]})
    if len(formatting_differences) != (358 if edition_id == 'deu1912' else 0):
        raise ValueError('The publisher numbering-marker exception inventory changed.')
    # The TXT export and publisher HTML retain bracketed numbering annotations.
    # Keep their exact display text; the comparison-only removal above never
    # modifies a source file or an output verse.
    rows = independent_rows
    display_text = {(row['bookId'], row['chapter'], row['verse']): row['text'] for row in rows}
    for bid, book in books.items():
        for chapter in book['chapters']:
            for verse in chapter['verses']:
                verse['text'] = display_text[(bid, chapter['number'], verse['number'])]
    inventory, omitted = [], []
    for bid, book in books.items():
        maxima, record_counts = [], []
        for chapter in book['chapters']:
            numbers = [verse['number'] for verse in chapter['verses']]
            maxima.append(max(numbers))
            record_counts.append(len(numbers))
            missing = sorted(set(range(1, max(numbers) + 1)) - set(numbers))
            if missing:
                omitted.append({'bookId': bid, 'chapter': chapter['number'], 'verseNumbers': missing})
        inventory.append({'id': bid, 'name': book['name'], 'chapters': len(book['chapters']),
                          'verseCounts': maxima, 'verseRecordCounts': record_counts})
    totals = {'books': len(books), 'chapters': sum(b['chapters'] for b in inventory), 'verses': len(rows)}
    if totals != source['expectedTotals']:
        raise ValueError(f'{edition_id}: unexpected source totals {totals}')
    manifest = {'schemaVersion': 1, 'edition': edition_metadata(edition_id), 'books': inventory, 'totals': totals,
                'verseCountSemantics': 'verseCounts is the maximum numbered verse in each chapter; verseRecordCounts is the number of source records. Omitted positions are not fabricated.'}
    parser = NoticeText()
    parser.feed(notice.decode('utf-8-sig'))
    notice_text = parser.text() + '\nSource and rights notice: ' + source['licenseUrl'] + '\n'
    if source.get('licenseDeedUrl'):
        notice_text += 'License: ' + source['licenseDeedUrl'] + '\n'
    files = {f'books/{bid}.json': json_bytes(book) for bid, book in books.items()}
    files.update({'manifest.json': json_bytes(manifest), 'search-index.json': json_bytes(rows), 'NOTICE.txt': notice_text.encode('utf-8')})
    provenance = {
        'members': {xml_name: sha(xml), text_name: sha(plain), notice_name: sha(notice)},
        'displayTextMember': text_name,
        'xmlAndPlainTextAgree': not formatting_differences,
        'xmlPlainTextCrossCheck': 'Exact agreement except the recorded publisher numeric-marker brackets; all other characters and references agree.' if formatting_differences else 'Exact agreement.',
        'publisherNumberingMarkerFormatDifferences': formatting_differences,
        'normalization': ['Decode source XML entities and UTF-8 byte-order marks.', 'Remove only ASCII XML/VPL padding at verse boundaries.',
                          'Map publisher VPL text book abbreviations to the equivalent XML book identifiers for validation.',
                          'Use the publisher VPL TXT as display text, retaining its bracketed alternate-numbering annotations.',
                          'Preserve canonical verse spelling, punctuation, numbering, diacritics and Unicode normalization exactly.'],
        'limitations': ['Publisher VPL excludes footnotes, section headings, introductions and paragraph layout.',
                       'Canonical navigation book names are the application English catalog labels, not a claimed translation of the edition title.'],
        'omittedNumberedPositions': omitted,
        'emptySourceRecords': [{'bookId': r['bookId'], 'chapter': r['chapter'], 'verse': r['verse']} for r in rows if not r['text']],
        'totals': totals,
    }
    return files, provenance


def quran_artifacts(edition_id, archive):
    source = SOURCES[edition_id]
    text_name = 'clearquran-allah-edition.txt'
    raw = member(archive, text_name, source['textSha256'])
    readme = member(archive, '_readme.txt')
    surahs = []
    comment_lines = []
    for line in raw.decode('utf-8-sig').splitlines():
        if not line:
            continue
        if line.startswith('#'):
            comment_lines.append(line)
            continue
        match = re.fullmatch(r'([1-9]\d*)\|([1-9]\d*)\|(.*)', line)
        if not match:
            raise ValueError('Unexpected ClearQuran row; source review is required.')
        surah_number, verse_number = int(match[1]), int(match[2])
        text = match[3]  # Do not strip, normalize or rewrite translation text.
        if not text or not valid_text(text):
            raise ValueError(f'Invalid ClearQuran text at {surah_number}:{verse_number}')
        if surah_number == len(surahs) + 1:
            surahs.append({'number': surah_number, 'verses': []})
        if surah_number != len(surahs) or verse_number != len(surahs[-1]['verses']) + 1:
            raise ValueError(f'Duplicate/missing ClearQuran reference: {surah_number}:{verse_number}')
        surahs[-1]['verses'].append({'number': verse_number, 'text': text})
    totals = {'surahs': len(surahs), 'verses': sum(len(s['verses']) for s in surahs)}
    if totals != source['expectedTotals']:
        raise ValueError(f'ClearQuran has unexpected source totals: {totals}')
    if 'CC BY-ND 4.0' not in readme.decode('utf-8-sig'):
        raise ValueError('The source copyright notice does not match the reviewed license.')
    notice = (readme.decode('utf-8-sig') + '\n' + source['attribution'] + '\n\n'
              + '\n'.join(source['conditions']) + '\n\nCurrent publisher terms: ' + source['licenseUrl'] + '\n')
    files = {
        'quran.json': json_bytes({'schemaVersion': 1, 'editionId': edition_id, 'surahs': surahs}),
        'manifest.json': json_bytes({'schemaVersion': 1, 'edition': edition_metadata(edition_id), 'totals': totals,
                                    'surahs': [{'number': s['number'], 'verseCount': len(s['verses'])} for s in surahs]}),
        'NOTICE.txt': notice.encode('utf-8'),
    }
    return files, {'members': {text_name: sha(raw), '_readme.txt': sha(readme)}, 'totals': totals,
                   'normalization': ['Decode UTF-8 byte-order mark and line delimiters.',
                                     'Parse numeric surah/verse delimiters only; preserve every translation text character.',
                                     'Keep publisher metadata comments outside the scripture text.'],
                   'sourceMetadataComments': comment_lines,
                   'limitations': ['English translation of Quran meanings; not Arabic source text.',
                                   'No Quran paraphrases or Bible–Quran editorial comparisons are approved by this import.']}


def build_artifacts(edition_id, raw):
    source = SOURCES[edition_id]
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if len(archive.infolist()) > 20 or sum(i.file_size for i in archive.infolist()) > 80_000_000:
            raise ValueError('Unexpected source archive inventory.')
        files, extra = (bible_artifacts if source['corpus'] == 'bible' else quran_artifacts)(edition_id, archive)
    provenance = {'schemaVersion': 1, 'editionId': edition_id, 'sourceUrl': source['sourceUrl'],
                  'downloadUrl': source['downloadUrl'], 'archiveSha256': sha(raw), 'sourceUpdatedAt': source['sourceUpdatedAt'],
                  'rightsObservedAt': OBSERVED_ON, 'licenseUrl': source['licenseUrl'], **extra,
                  'generatedFileSha256': {name: sha(content) for name, content in files.items()}}
    files['provenance.json'] = json_bytes(provenance)
    return files


def verify_outputs(output, pending_indexes=None):
    catalog = json.loads((output / 'catalog.json').read_text(encoding='utf-8'))
    expected_catalog = {'schemaVersion': 1, 'editions': [edition_metadata(edition_id) for edition_id in SOURCES]}
    if catalog != expected_catalog:
        raise ValueError('Edition catalog metadata differs from pinned rights/source declarations.')
    summaries = []
    for edition_id, source in SOURCES.items():
        directory = output / edition_id
        provenance = json.loads((directory / 'provenance.json').read_text(encoding='utf-8'))
        if provenance['archiveSha256'] != source['sha256'] or provenance['totals'] != source['expectedTotals']:
            raise ValueError(f'{edition_id}: invalid provenance source pin or totals.')
        for name, expected in provenance['generatedFileSha256'].items():
            target = (directory / name).resolve()
            if not target.is_relative_to(directory.resolve()):
                raise ValueError(f'{edition_id}: generated path escapes edition directory: {name}')
            if pending_indexes is not None and source['corpus'] == 'bible' and name == 'search-index.json':
                continue  # Regenerate this derived file after validating all committed inputs.
            if sha(target.read_bytes()) != expected:
                raise ValueError(f'{edition_id}: generated content hash mismatch: {name}')
        manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
        if manifest['edition'] != edition_metadata(edition_id) or manifest['totals'] != source['expectedTotals']:
            raise ValueError(f'{edition_id}: manifest metadata mismatch.')
        if source['corpus'] == 'bible':
            rows = []
            for meta in manifest['books']:
                book = json.loads((directory / 'books' / (meta['id'] + '.json')).read_text(encoding='utf-8'))
                if len(book['chapters']) != meta['chapters']:
                    raise ValueError(f'{edition_id}: incorrect chapter count for {meta["id"]}.')
                for i, chapter in enumerate(book['chapters']):
                    numbers = [v['number'] for v in chapter['verses']]
                    if chapter['number'] != i + 1 or numbers != sorted(set(numbers)) or max(numbers) != meta['verseCounts'][i] or len(numbers) != meta['verseRecordCounts'][i]:
                        raise ValueError(f'{edition_id}: incorrect chapter inventory for {meta["id"]} {i + 1}.')
                    rows.extend({'bookId': book['id'], 'chapter': chapter['number'], 'verse': v['number'], 'text': v['text'], 'editionId': edition_id} for v in chapter['verses'])
            if len(rows) != manifest['totals']['verses']:
                raise ValueError(f'{edition_id}: search index differs from displayed source text.')
            if pending_indexes is not None:
                index_bytes = json_bytes(rows)
                if sha(index_bytes) != provenance['generatedFileSha256']['search-index.json']:
                    raise ValueError(f'{edition_id}: rebuilt index differs from the pinned generated output.')
                pending_indexes.append((directory / 'search-index.json', index_bytes))
            else:
                search = json.loads((directory / 'search-index.json').read_text(encoding='utf-8'))
                if rows != search:
                    raise ValueError(f'{edition_id}: search index differs from displayed source text.')
        else:
            corpus = json.loads((directory / 'quran.json').read_text(encoding='utf-8'))
            if len(corpus['surahs']) != 114 or sum(len(s['verses']) for s in corpus['surahs']) != 6236:
                raise ValueError('ClearQuran inventory mismatch.')
        summaries.append({'id': edition_id, 'totals': source['expectedTotals'], 'verified': True})
    return summaries


def rebuild_indexes(output):
    """Rebuild only the two derived indexes from verified committed source files."""
    pending = []
    summaries = verify_outputs(output, pending_indexes=pending)
    # No writes occur until every edition's committed inputs and both resulting
    # index hashes have been validated. No archive or network code is involved.
    rebuilt = []
    for target, content in pending:
        temporary = target.with_name(target.name + '.importing')
        temporary.write_bytes(content)
        temporary.replace(target)
        rebuilt.append({'id': target.parent.name, 'bytes': len(content), 'sha256': sha(content)})
    return {'mode': 'rebuild-indexes', 'indexes': rebuilt, 'editions': summaries}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, help='Directory outside the repository containing ID.zip files.')
    parser.add_argument('--download', action='store_true', help='Download missing pinned archives from publisher URLs.')
    parser.add_argument('--output', type=Path, default=OUTPUT, help='Generated edition directory (default: data/editions).')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--verify', action='store_true', help='Verify generated files without network or raw archives.')
    mode.add_argument('--check', action='store_true', help='Rebuild in memory from pinned archives and compare without writing.')
    mode.add_argument('--rebuild-indexes', action='store_true', help='Recreate only Bible search indexes from committed books and manifests; no network or archives.')
    args = parser.parse_args()
    if args.rebuild_indexes:
        print(json.dumps(rebuild_indexes(args.output), ensure_ascii=False))
        return
    if args.verify:
        print(json.dumps({'editions': verify_outputs(args.output)}, ensure_ascii=False))
        return
    if not args.source_dir:
        parser.error('--source-dir is required for import or --check.')
    generated = {}
    for edition_id in SOURCES:
        raw = archive_bytes(edition_id, args.source_dir, args.download)
        generated[edition_id] = build_artifacts(edition_id, raw)
    catalog = json_bytes({'schemaVersion': 1, 'editions': [edition_metadata(edition_id) for edition_id in SOURCES]})
    # Validate all three archives before replacing any generated output.
    for edition_id, files in generated.items():
        for name, content in files.items():
            target = args.output / edition_id / name
            if args.check:
                if not target.exists() or target.read_bytes() != content:
                    raise ValueError(f'Reproducibility mismatch: {edition_id}/{name}')
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_name(target.name + '.importing')
                temporary.write_bytes(content)
                temporary.replace(target)
    target = args.output / 'catalog.json'
    if args.check:
        if not target.exists() or target.read_bytes() != catalog:
            raise ValueError('Reproducibility mismatch: catalog.json')
    else:
        args.output.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.importing')
        temporary.write_bytes(catalog)
        temporary.replace(target)
    print(json.dumps({'mode': 'reproducibility-check' if args.check else 'import',
                      'editions': verify_outputs(args.output)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, ET.ParseError, zipfile.BadZipFile) as error:
        print(f'Edition import failed: {error}', file=sys.stderr)
        raise SystemExit(1)
