#!/usr/bin/env python3
"""Reproduce the pinned OSHB source-study corpus without selecting a reading.

Uses only Python's standard library. Source caches stay outside the repository.
All canonical XML character data and attributes are preserved, including mixed
word segments, notes, catchwords, reading alternatives and formatting whitespace.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import tarfile
import tempfile
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'data/original-language/oshb'
NS = 'http://www.bibletechnologies.net/2003/OSIS/namespace'
BOOKS = [
    ('Gen', 'Genesis'), ('Exod', 'Exodus'), ('Lev', 'Leviticus'),
    ('Num', 'Numbers'), ('Deut', 'Deuteronomy'), ('Josh', 'Joshua'),
    ('Judg', 'Judges'), ('Ruth', 'Ruth'), ('1Sam', '1 Samuel'),
    ('2Sam', '2 Samuel'), ('1Kgs', '1 Kings'), ('2Kgs', '2 Kings'),
    ('1Chr', '1 Chronicles'), ('2Chr', '2 Chronicles'), ('Ezra', 'Ezra'),
    ('Neh', 'Nehemiah'), ('Esth', 'Esther'), ('Job', 'Job'), ('Ps', 'Psalms'),
    ('Prov', 'Proverbs'), ('Eccl', 'Ecclesiastes'), ('Song', 'Song of Songs'),
    ('Isa', 'Isaiah'), ('Jer', 'Jeremiah'), ('Lam', 'Lamentations'),
    ('Ezek', 'Ezekiel'), ('Dan', 'Daniel'), ('Hos', 'Hosea'), ('Joel', 'Joel'),
    ('Amos', 'Amos'), ('Obad', 'Obadiah'), ('Jonah', 'Jonah'), ('Mic', 'Micah'),
    ('Nah', 'Nahum'), ('Hab', 'Habakkuk'), ('Zeph', 'Zephaniah'),
    ('Hag', 'Haggai'), ('Zech', 'Zechariah'), ('Mal', 'Malachi'),
]
ALLOWED_CHILDREN = {
    'verse': {'w', 'seg', 'note'}, 'w': {'seg'}, 'seg': set(),
    'note': {'catchWord', 'rdg'}, 'catchWord': set(), 'rdg': {'w', 'seg'},
}
ALLOWED_ATTRIBUTES = {
    'w': {'lemma', 'morph', 'id', 'n', 'type'},
    'seg': {'type', 'subType'}, 'note': {'type', 'n'},
    'rdg': {'type'}, 'catchWord': set(),
}
ALLOWED_TYPES = {
    'w': {'x-ketiv'}, 'note': {'variant', 'exegesis', 'alternative'},
    'rdg': {'x-qere', 'x-accent'},
    'seg': {'x-sof-pasuq', 'x-samekh', 'x-maqqef', 'x-paseq', 'x-pe',
            'x-large', 'x-small', 'x-suspended', 'x-reversednun'},
}
COUNT_KEYS = ('words', 'mainTextWords', 'readingWords', 'ketivWords',
              'qereWords', 'notes', 'variantNotes', 'accentAlternatives',
              'segments', 'missingWordIds', 'missingLemma', 'missingMorphology')


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def encode_json(value: object, pretty: bool = False) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2 if pretty else None,
                       separators=None if pretty else (',', ':')) + '\n').encode('utf-8')


def local_name(element: ET.Element) -> str:
    if not isinstance(element.tag, str) or not element.tag.startswith('{' + NS + '}'):
        raise ValueError(f'Unexpected source namespace/markup: {element.tag!r}')
    return element.tag.split('}', 1)[1]


def xml_root(data: bytes) -> ET.Element:
    # No DTD/entity expansion or silent comment/processing-instruction loss.
    if b'<!DOCTYPE' in data or b'<!ENTITY' in data:
        raise ValueError('DTD/entities are not admitted in pinned OSHB sources')
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True))
    return ET.fromstring(data, parser=parser)


def mixed_content(element: ET.Element, convert) -> list:
    parts = []
    if element.text is not None:
        parts.append(element.text)
    for child in element:
        parts.append(convert(child))
        if child.tail is not None:
            parts.append(child.tail)
    return parts


def source_node(element: ET.Element, parent: str = 'verse') -> dict:
    tag = local_name(element)
    if tag not in ALLOWED_CHILDREN.get(parent, set()):
        raise ValueError(f'Unsupported reading markup {parent}>{tag}')
    extra = set(element.attrib) - ALLOWED_ATTRIBUTES[tag]
    if extra:
        raise ValueError(f'Unsupported {tag} attributes: {sorted(extra)}')
    if 'type' in element.attrib and element.attrib['type'] not in ALLOWED_TYPES.get(tag, set()):
        raise ValueError(f'Unsupported {tag} type: {element.attrib["type"]}')
    if 'subType' in element.attrib and element.attrib['subType'] != 'x-ketiv':
        raise ValueError(f'Unsupported {tag} subType: {element.attrib["subType"]}')
    return {'tag': tag, 'attributes': dict(element.attrib),
            'content': mixed_content(element, lambda child: source_node(child, tag))}


def header_node(element: ET.Element) -> dict:
    # The complete source header is retained as data, never executed as HTML.
    tag = local_name(element)
    allowed = {'header', 'revisionDesc', 'date', 'p', 'work', 'title',
               'contributor', 'identifier', 'rights', 'refSystem', 'description',
               'creator', 'publisher', 'source', 'workPrefix'}
    if tag not in allowed:
        raise ValueError(f'Unsupported source header element: {tag}')
    return {'tag': tag, 'attributes': dict(element.attrib),
            'content': mixed_content(element, header_node)}


def walk_nodes(content: list, reading: str | None = None):
    for node in content:
        if isinstance(node, str):
            continue
        context = node['attributes'].get('type', 'unspecified') if node['tag'] == 'rdg' else reading
        yield node, context
        yield from walk_nodes(node['content'], context)


def node_counts(content: list) -> dict:
    counts = Counter({key: 0 for key in COUNT_KEYS})
    for node, reading in walk_nodes(content):
        tag, attrs = node['tag'], node['attributes']
        if tag == 'w':
            counts['words'] += 1
            counts['readingWords' if reading is not None else 'mainTextWords'] += 1
            counts['ketivWords'] += attrs.get('type') == 'x-ketiv'
            counts['qereWords'] += reading == 'x-qere'
            for key, out in [('id', 'missingWordIds'), ('lemma', 'missingLemma'), ('morph', 'missingMorphology')]:
                counts[out] += not bool(attrs.get(key))
        elif tag == 'note':
            counts['notes'] += 1
            counts['variantNotes'] += attrs.get('type') == 'variant'
            counts['accentAlternatives'] += attrs.get('type') == 'alternative'
        elif tag == 'seg':
            counts['segments'] += 1
    return dict(counts)


def parse_book(data: bytes, book_id: str, name: str, revision: str) -> dict:
    root = xml_root(data)
    if local_name(root) != 'osis' or len(root) != 1 or local_name(root[0]) != 'osisText':
        raise ValueError('Expected one OSIS text')
    text = root[0]
    if [local_name(n) for n in text] != ['header', 'div']:
        raise ValueError('Unexpected OSIS text structure')
    for container in (root, text):
        if (container.text or '').strip() or any((child.tail or '').strip() for child in container):
            raise ValueError('Unexpected text outside source book boundaries')
    div = text[1]
    if div.attrib != {'type': 'book', 'osisID': book_id}:
        raise ValueError(f'Unexpected book identity: {div.attrib}')
    chapters, seen = [], set()
    for chapter in div:
        if local_name(chapter) != 'chapter' or set(chapter.attrib) != {'osisID'}:
            raise ValueError('Unexpected chapter markup')
        ref = chapter.attrib['osisID']
        if not re.fullmatch(re.escape(book_id) + r'\.[1-9][0-9]*', ref) or ref in seen:
            raise ValueError(f'Invalid/duplicate source chapter ID: {ref}')
        seen.add(ref)
        verses = []
        for verse in chapter:
            if local_name(verse) != 'verse' or set(verse.attrib) != {'osisID'}:
                raise ValueError('Unexpected verse markup')
            verse_ref = verse.attrib['osisID']
            if not re.fullmatch(re.escape(ref) + r'\.[0-9]+', verse_ref) or verse_ref in seen:
                raise ValueError(f'Invalid/duplicate source verse ID: {verse_ref}')
            seen.add(verse_ref)
            verses.append({'osisId': verse_ref, 'number': verse_ref.rsplit('.', 1)[1],
                           'content': mixed_content(verse, source_node)})
        # Container indentation is not Scripture; non-whitespace text fails closed.
        for container in (chapter,):
            if (container.text or '').strip() or any((v.tail or '').strip() for v in container):
                raise ValueError('Unexpected text outside source verse boundaries')
        chapters.append({'schemaVersion': 1, 'sourceId': 'oshb', 'sourceRevision': revision,
                         'osisId': ref, 'book': book_id, 'number': ref.rsplit('.', 1)[1],
                         'verses': verses})
    if (div.text or '').strip() or any((c.tail or '').strip() for c in div):
        raise ValueError('Unexpected text outside source chapter boundaries')
    return {'schemaVersion': 1, 'sourceId': 'oshb', 'sourceRevision': revision,
            'book': book_id, 'name': name, 'sourceTextAttributes': dict(text.attrib),
            'sourceHeader': header_node(text[0]), 'chapters': chapters}


class GrammarTables(HTMLParser):
    """Extract only source table cell text. Never ship executable HTML."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.heading, self.heading_id = [], '', None
        self.in_heading = False
        self.in_cell = False
        self.table = self.row = None
        self.cell = ''

    def handle_starttag(self, tag, attrs):
        if tag in ('h2', 'h3'):
            self.in_heading, self.heading, self.heading_id = True, '', dict(attrs).get('id')
        elif tag == 'table':
            if self.table is not None:
                raise ValueError('Nested grammar tables are unsupported')
            self.table = {'heading': self.heading.strip(), 'id': self.heading_id, 'rows': []}
        elif tag == 'tr' and self.table is not None:
            self.row = []
        elif tag in ('td', 'th') and self.row is not None:
            self.in_cell, self.cell = True, ''

    def handle_data(self, data):
        if self.in_heading:
            self.heading += data
        if self.in_cell:
            self.cell += data

    def handle_endtag(self, tag):
        if tag in ('h2', 'h3'):
            self.in_heading = False
        elif tag in ('td', 'th') and self.in_cell:
            self.row.append(self.cell.strip())
            self.in_cell = False
        elif tag == 'tr' and self.row is not None:
            self.table['rows'].append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def grammar_data(xml_data: bytes, html_data: bytes, revision: str) -> dict:
    root = xml_root(xml_data)
    ns = '{http://www.crosswire.org/2008/TEIOSIS/namespace}'
    entries = root.findall('.//' + ns + 'entryFree')
    codes = {}
    for entry in entries:
        if set(entry.attrib) != {'n'} or len(entry):
            raise ValueError('Unexpected morphology-key markup')
        key = entry.attrib['n']
        if key in codes:
            raise ValueError(f'Duplicate source morphology key: {key}')
        # Preserve original description, including its leading space.
        codes[key] = entry.text or ''
    if not codes:
        raise ValueError('No source morphology descriptions')
    html = html_data.decode('utf-8')
    if 'creativecommons.org/licenses/by/4.0/' not in html:
        raise ValueError('Expected explicit CC BY 4.0 grammar notice')
    parser = GrammarTables()
    parser.feed(html)
    if len(parser.tables) != 17:
        raise ValueError('Unexpected source morphology table inventory')
    return {'schemaVersion': 1, 'sourceId': 'oshb', 'sourceRevision': revision,
            'sourceFiles': ['parsing/Oshm.xml', 'parsing/HebrewMorphologyCodes.html'],
            'license': 'CC-BY-4.0', 'codes': codes, 'tables': parser.tables,
            'limitations': 'Descriptions reproduce the pinned upstream key. An absent code or absent annotation is unknown; no guessed expansion, gloss, transliteration, or word sense is supplied.'}


def read_sources(archive_path: Path, pins: dict) -> dict[str, bytes]:
    data = archive_path.read_bytes()
    expected = pins['upstream']
    if len(data) != expected['archiveBytes'] or sha256(data) != expected['archiveSha256']:
        raise ValueError('Archive size/SHA-256 differs from the admitted source pin')
    needed = {item['path']: item for item in pins['sourceFiles']}
    result, seen = {}, set()
    prefix = 'morphhb-' + expected['commit'] + '/'
    with tarfile.open(archive_path, 'r:gz') as archive:
        for member in archive:
            parts = Path(member.name).parts
            if member.name.startswith('/') or '..' in parts or member.name in seen:
                raise ValueError('Unsafe or duplicate archive member')
            seen.add(member.name)
            if member.name == prefix.rstrip('/') and member.isdir():
                continue
            if not member.name.startswith(prefix):
                raise ValueError('Unexpected archive root')
            rel = member.name[len(prefix):]
            if rel not in needed:
                continue
            pin = needed[rel]
            if not member.isfile() or member.size != pin['bytes'] or member.size > 4_000_000:
                raise ValueError(f'Invalid source member: {rel}')
            content = archive.extractfile(member).read()
            if sha256(content) != pin['sha256'] or git_blob_sha(content) != pin['gitBlobSha']:
                raise ValueError(f'Pinned source bytes differ: {rel}')
            result[rel] = content
    if set(result) != set(needed):
        raise ValueError('Pinned source files missing from archive')
    return result


def source_archive(path: Path | None, pins: dict) -> Path:
    if path is not None:
        return path
    path = Path(tempfile.gettempdir()) / 'adigun-oshb-source' / (pins['upstream']['commit'] + '.tar.gz')
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(pins['upstream']['archiveUrl'], headers={'User-Agent': 'Adigun-AiBible source importer'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(pins['upstream']['archiveBytes'] + 1)
    if len(data) != pins['upstream']['archiveBytes'] or sha256(data) != pins['upstream']['archiveSha256']:
        raise ValueError('Downloaded archive did not match pin')
    path.write_bytes(data)
    return path


def build(pins: dict, sources: dict[str, bytes]) -> dict[str, bytes]:
    revision = pins['upstream']['commit']
    grammar = grammar_data(sources['parsing/Oshm.xml'], sources['parsing/HebrewMorphologyCodes.html'], revision)
    outputs = {'morphology.json': encode_json(grammar)}
    notice_paths = {
        'LICENSE.md': 'notices/LICENSE.md', 'README.md': 'notices/README.md',
        'parsing/README.md': 'notices/parsing-README.md',
        'parsing/HebrewMorphologyCodes.html': 'notices/HebrewMorphologyCodes.html.txt',
        'parsing/Oshm.xml': 'notices/Oshm.xml.txt',
    }
    for source, destination in notice_paths.items():
        outputs[destination] = sources[source]
    inventory = {'nodes': Counter(), 'attributes': defaultdict(Counter), 'types': defaultdict(Counter)}
    counts = Counter({k: 0 for k in COUNT_KEYS})
    word_ids, duplicate_ids, unknown_codes = set(), Counter(), Counter()
    books = []
    for book_id, name in BOOKS:
        source_path = f'wlc/{book_id}.xml'
        book = parse_book(sources[source_path], book_id, name, revision)
        chapter_inventory, book_counts = [], Counter({k: 0 for k in COUNT_KEYS})
        for chapter in book['chapters']:
            chapter_counts = Counter({k: 0 for k in COUNT_KEYS})
            for verse in chapter['verses']:
                chapter_counts.update(node_counts(verse['content']))
                for node, reading in walk_nodes(verse['content']):
                    tag, attrs = node['tag'], node['attributes']
                    inventory['nodes'][tag] += 1
                    inventory['attributes'][tag].update(attrs.keys())
                    for attr in ('type', 'subType'):
                        if attr in attrs:
                            inventory['types'][tag + '@' + attr][attrs[attr]] += 1
                    if tag == 'w':
                        wid = attrs.get('id')
                        if wid:
                            if wid in word_ids:
                                duplicate_ids[wid] += 1
                            word_ids.add(wid)
                        morph = attrs.get('morph')
                        if morph and morph not in grammar['codes']:
                            unknown_codes[morph] += 1
            book_counts.update(chapter_counts)
            chapter_inventory.append({'osisId': chapter['osisId'], 'number': chapter['number'],
                                      'verseNumbers': [v['number'] for v in chapter['verses']],
                                      'verseCount': len(chapter['verses']), 'counts': dict(chapter_counts)})
        path = f'books/{book_id}.json'
        content = encode_json(book)
        outputs[path] = content
        counts.update(book_counts)
        books.append({'id': book_id, 'name': name, 'path': path, 'bytes': len(content),
                      'sha256': sha256(content), 'sourcePath': source_path,
                      'chapterCount': len(chapter_inventory),
                      'verseCount': sum(c['verseCount'] for c in chapter_inventory),
                      'counts': dict(book_counts), 'chapters': chapter_inventory})
    manifest = {
        'schemaVersion': 1, 'sourceId': 'oshb', 'title': 'Open Scriptures Hebrew Bible',
        'sourceRevision': revision, 'sourceRepository': pins['upstream']['repository'],
        'sourcePinPath': 'source.json', 'attribution': pins['license']['requiredAttribution'],
        'textLicense': 'Public Domain (upstream declaration)', 'annotationLicense': 'CC-BY-4.0',
        'licenseUrl': pins['license']['url'], 'licenseNoticePath': 'notices/LICENSE.md',
        'sourceReadmePath': 'notices/README.md', 'morphologyPath': 'morphology.json',
        'languages': ['Hebrew', 'Aramaic'], 'direction': 'rtl',
        'referenceSystem': 'Source OSIS Bible.MT; original source verse numbering only',
        'scope': '39 source books of the Hebrew Bible, with Hebrew and Aramaic annotations. Not a translated Bible edition or a 66-book Bible.',
        'bookOrder': 'Application navigation order; source book and verse identities are unchanged.',
        'readingPolicy': 'Main-text words, ketiv, qere, accent alternatives, notes and embedded segments are separate ordered source nodes. No alternate reading is silently selected.',
        'normalization': 'No Unicode normalization, pointing removal, slash removal, verse remapping, word-ID rewriting or morphology repair. XML character references and line endings are decoded by the XML standard; exact original file bytes remain pinned.',
        'annotationStatus': 'Pinned upstream annotations, not independent linguistic or human editorial certification. Empty/missing annotations are unknown. x characters may be upstream grammatical placeholders; do not infer completeness from their absence.',
        'alignment': None, 'glosses': None, 'transliteration': None, 'audio': None,
        'bookCount': len(books), 'chapterCount': sum(b['chapterCount'] for b in books),
        'verseCount': sum(b['verseCount'] for b in books), 'counts': dict(counts),
        'uniqueWordIds': len(word_ids), 'duplicateWordIds': dict(sorted(duplicate_ids.items())),
        'unexpandedMorphologyCodes': dict(sorted(unknown_codes.items())),
        'supportedMarkup': {'children': {k: sorted(v) for k, v in ALLOWED_CHILDREN.items()},
                            'attributes': {k: sorted(v) for k, v in ALLOWED_ATTRIBUTES.items()},
                            'types': {k: sorted(v) for k, v in ALLOWED_TYPES.items()}},
        'observedMarkup': inventory, 'books': books,
        'outputs': [{'path': p, 'bytes': len(v), 'sha256': sha256(v)} for p, v in sorted(outputs.items())],
    }
    outputs['manifest.json'] = encode_json(manifest, pretty=True)
    # A separate ledger hashes the manifest, avoiding a self-referential digest.
    ledger = {'schemaVersion': 1, 'sourceId': 'oshb', 'sourceRevision': revision,
              'sourcePinSha256': sha256((DEST / 'source.json').read_bytes()),
              'files': [{'path': p, 'bytes': len(v), 'sha256': sha256(v)} for p, v in sorted(outputs.items())]}
    outputs['integrity.json'] = encode_json(ledger, pretty=True)
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Already downloaded exact pinned tar.gz, outside the repository')
    parser.add_argument('--check', action='store_true', help='Verify every generated byte against checked-in outputs; do not write')
    args = parser.parse_args()
    pins = json.loads((DEST / 'source.json').read_text())
    sources = read_sources(source_archive(args.archive, pins), pins)
    outputs = build(pins, sources)
    unexpected = {p.relative_to(DEST).as_posix() for p in DEST.rglob('*') if p.is_file()} - set(outputs) - {'source.json'}
    if unexpected:
        raise ValueError(f'Unexpected generated output files: {sorted(unexpected)}')
    for rel, data in outputs.items():
        path = DEST / rel
        if args.check:
            if not path.exists() or path.read_bytes() != data:
                raise ValueError(f'Output missing or differs from pinned source: {rel}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    manifest = json.loads(outputs['manifest.json'])
    print(json.dumps({'verified' if args.check else 'generated': len(outputs),
                      'sourceRevision': pins['upstream']['commit'],
                      'books': manifest['bookCount'], 'chapters': manifest['chapterCount'],
                      'verses': manifest['verseCount'], 'counts': manifest['counts'],
                      'bytes': sum(len(v) for v in outputs.values())}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, ET.ParseError) as error:
        print(f'OSHB import failed closed: {error}', file=sys.stderr)
        sys.exit(1)
