#!/usr/bin/env python3
"""Import the pinned, public-domain eBible VPL archive without changing verse wording."""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE_SHA = '37a8ccecfbc765a2305ae64f3b5e88d1d01bafceb9a33e8d191f6ee551a437b9'
XML_SHA = '99a8ab49e3f59739a614f4c67304e159b246053a315ca7b800a0baf4b60f1997'
BOOKS = [
    ('GEN', 'Genesis', 50), ('EXO', 'Exodus', 40), ('LEV', 'Leviticus', 27), ('NUM', 'Numbers', 36), ('DEU', 'Deuteronomy', 34),
    ('JOS', 'Joshua', 24), ('JDG', 'Judges', 21), ('RUT', 'Ruth', 4), ('1SA', '1 Samuel', 31), ('2SA', '2 Samuel', 24),
    ('1KI', '1 Kings', 22), ('2KI', '2 Kings', 25), ('1CH', '1 Chronicles', 29), ('2CH', '2 Chronicles', 36), ('EZR', 'Ezra', 10),
    ('NEH', 'Nehemiah', 13), ('EST', 'Esther', 10), ('JOB', 'Job', 42), ('PSA', 'Psalms', 150), ('PRO', 'Proverbs', 31),
    ('ECC', 'Ecclesiastes', 12), ('SNG', 'Song of Solomon', 8), ('ISA', 'Isaiah', 66), ('JER', 'Jeremiah', 52), ('LAM', 'Lamentations', 5),
    ('EZK', 'Ezekiel', 48), ('DAN', 'Daniel', 12), ('HOS', 'Hosea', 14), ('JOL', 'Joel', 3), ('AMO', 'Amos', 9),
    ('OBA', 'Obadiah', 1), ('JON', 'Jonah', 4), ('MIC', 'Micah', 7), ('NAM', 'Nahum', 3), ('HAB', 'Habakkuk', 3),
    ('ZEP', 'Zephaniah', 3), ('HAG', 'Haggai', 2), ('ZEC', 'Zechariah', 14), ('MAL', 'Malachi', 4), ('MAT', 'Matthew', 28),
    ('MRK', 'Mark', 16), ('LUK', 'Luke', 24), ('JHN', 'John', 21), ('ACT', 'Acts', 28), ('ROM', 'Romans', 16),
    ('1CO', '1 Corinthians', 16), ('2CO', '2 Corinthians', 13), ('GAL', 'Galatians', 6), ('EPH', 'Ephesians', 6), ('PHP', 'Philippians', 4),
    ('COL', 'Colossians', 4), ('1TH', '1 Thessalonians', 5), ('2TH', '2 Thessalonians', 3), ('1TI', '1 Timothy', 6), ('2TI', '2 Timothy', 4),
    ('TIT', 'Titus', 3), ('PHM', 'Philemon', 1), ('HEB', 'Hebrews', 13), ('JAS', 'James', 5), ('1PE', '1 Peter', 5),
    ('2PE', '2 Peter', 3), ('1JN', '1 John', 5), ('2JN', '2 John', 1), ('3JN', '3 John', 1), ('JUD', 'Jude', 1), ('REV', 'Revelation', 22)
]
TEXT_IDS = {'SOL': 'SNG', 'EZE': 'EZK', 'JOE': 'JOL', 'NAH': 'NAM', 'MAR': 'MRK', 'JOH': 'JHN', 'PHI': 'PHP', 'JAM': 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN'}
SOURCE_EMPTY = {('LUK', 17, 36), ('ACT', 8, 37), ('ACT', 15, 34), ('ACT', 24, 7), ('ROM', 16, 25)}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def import_archive(path):
    raw = Path(path).read_bytes()
    if len(raw) > 20_000_000 or sha(raw) != ARCHIVE_SHA:
        raise ValueError('The archive does not match the reviewed source checksum.')
    with zipfile.ZipFile(path) as archive:
        for name in ['engwebp_vpl.xml', 'engwebp_vpl.txt']:
            if archive.getinfo(name).file_size > 12_000_000:
                raise ValueError('Source member is unexpectedly large.')
        source = archive.read('engwebp_vpl.xml')
        plain = archive.read('engwebp_vpl.txt')
    if sha(source) != XML_SHA:
        raise ValueError('The XML member does not match its reviewed checksum.')
    document = ET.fromstring(source)
    if document.tag != 'verseFile':
        raise ValueError('Unsupported source format.')
    books = {bid: {'id': bid, 'name': name, 'chapters': []} for bid, name, _ in BOOKS}
    rows = []
    for verse in document:
        if verse.tag != 'v' or len(verse) or set(verse.attrib) != {'b', 'c', 'v'}:
            raise ValueError('Unexpected source markup; manual review is required.')
        bid = verse.attrib['b']
        chapter, number = int(verse.attrib['c']), int(verse.attrib['v'])
        text = (verse.text or '').strip()  # XML export adds formatting spaces outside the verse.
        if bid not in books or (not text and (bid, chapter, number) not in SOURCE_EMPTY) or '\ufffd' in text or any(ord(c) < 32 and c not in '\t\n\r' for c in text):
            raise ValueError(f'Invalid source verse: {bid} {chapter}:{number}')
        chapters = books[bid]['chapters']
        if chapter == len(chapters) + 1:
            chapters.append({'number': chapter, 'verses': []})
        if chapter != len(chapters) or number != len(chapters[-1]['verses']) + 1:
            raise ValueError(f'Noncontiguous or duplicate source reference: {bid} {chapter}:{number}')
        chapters[-1]['verses'].append({'number': number, 'text': text})
        rows.append({'bookId': bid, 'chapter': chapter, 'verse': number, 'text': text})
    # Independently reconcile the publisher's text and XML exports, after book-code normalization.
    text_rows = []
    for line in plain.decode('utf-8-sig').splitlines():
        match = re.fullmatch(r'([A-Z0-9]{3}) (\d+):(\d+) (.*)', line)
        if not match:
            raise ValueError('Unexpected plain-text source row.')
        bid, chapter, number, text = match.groups()
        text_rows.append({'bookId': TEXT_IDS.get(bid, bid), 'chapter': int(chapter), 'verse': int(number), 'text': text.strip()})
    if rows != text_rows:
        raise ValueError('The publisher XML and plain-text exports disagree; manual review is required.')
    inventory = []
    for bid, name, expected_chapters in BOOKS:
        chapters = books[bid]['chapters']
        if len(chapters) != expected_chapters:
            raise ValueError(f'Unexpected chapter coverage for {bid}.')
        inventory.append({'id': bid, 'name': name, 'chapters': len(chapters), 'verseCounts': [len(c['verses']) for c in chapters]})
    totals = {'books': len(books), 'chapters': sum(b['chapters'] for b in inventory), 'verses': len(rows)}
    if totals != {'books': 66, 'chapters': 1189, 'verses': 31103}:
        raise ValueError(f'The pinned edition has unexpected totals: {totals}')
    output = ROOT / 'data'
    (output / 'books').mkdir(parents=True, exist_ok=True)
    hashes = {}
    def save(relative, value):
        data = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        hashes[relative] = sha(data)
    for bid, _, _ in BOOKS:
        save(f'books/{bid}.json', books[bid])
    save('search-index.json', rows)
    manifest = {'schemaVersion': 1, 'edition': {
        'id': 'eng-web', 'name': 'World English Bible (Protestant Edition)', 'language': 'en', 'license': 'Public domain',
        'sourceUrl': 'https://ebible.org/engwebp/', 'licenseUrl': 'https://ebible.org/engwebp/copyright.htm', 'sha256': ARCHIVE_SHA
    }, 'books': inventory, 'totals': totals}
    save('manifest.json', manifest)
    provenance = {
        'schemaVersion': 1, 'editionId': 'eng-web', 'publisher': 'eBible.org', 'publisherEditionId': 'engwebp',
        'reviewedAt': '2026-11-03', 'sourceUpdatedAt': '2026-10-30',
        'sourceUrl': 'https://ebible.org/engwebp/', 'downloadUrl': 'https://ebible.org/Scriptures/engwebp_vpl.zip',
        'formatUrl': 'https://ebible.org/find/details.php?id=engwebp', 'licenseUrl': 'https://ebible.org/engwebp/copyright.htm',
        'license': 'Public domain; World English Bible is a trademark of eBible.org. Altered wording must not be represented as this edition.',
        'archiveSha256': ARCHIVE_SHA, 'xmlMember': 'engwebp_vpl.xml', 'xmlSha256': sha(source),
        'textMember': 'engwebp_vpl.txt', 'textSha256': sha(plain),
        'normalization': ['Keep publisher SIL/UBS book identifiers from XML.', 'Remove XML export padding at verse boundaries only.', 'Preserve verse wording, punctuation, spelling, numbering, and Unicode.', 'Verify every normalized XML row against the publisher plain-text export.'],
        'sourceLimitations': ['Publisher VPL contains canonical verse text only; formatting, paragraph breaks, footnotes, introductions, and noncanonical section headings are omitted by the publisher.', 'Five numbered source records contain no main-text wording; their empty text is preserved and must never be replaced by invented scripture.'],
        'sourceEmptyReferences': [{'bookId': b, 'chapter': c, 'verse': v} for b, c, v in sorted(SOURCE_EMPTY)],
        'totals': totals, 'canonicalBooks': [{'id': bid, 'name': name, 'chapters': count} for bid, name, count in BOOKS],
        'generatedFileSha256': hashes
    }
    save('provenance.json', provenance)
    print(f'Imported {totals["books"]} books, {totals["chapters"]:,} chapters, {totals["verses"]:,} verses; XML and text agree exactly.')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 scripts/import-corpus.py /path/to/engwebp_vpl.zip')
    import_archive(sys.argv[1])
