#!/usr/bin/env python3
"""Import the pinned public-domain Strong XML sources; never execute upstream JS.

Usage: python3 scripts/import-lexicon.py --source-dir /path/to/openscriptures-strongs
       python3 scripts/import-lexicon.py --verify
No network is needed for verification. Source files and commit are pinned below.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'linguistics'
COMMIT = '0acd2f251c2d35ff8db2dece4e0593979d3ac223'
BASE = f'https://github.com/openscriptures/strongs/blob/{COMMIT}/'
SOURCES = {
    'greek': ('greek/StrongsGreekDictionaryXML_1.4/strongsgreek.xml', 'df928f01b37632f8af9f16289ce58d10b958014cb5dbd1e1ea715a8d311a0625'),
    'hebrew': ('hebrew/StrongHebrewG.xml', '1f9659ea208f4c498843a0280dacb1448627c33ca77712642d8705793ab66061'),
}
NS = {'s': 'http://www.bibletechnologies.net/2003/OSIS/namespace'}
XML_LANG = '{http://www.w3.org/XML/1998/namespace}lang'

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def digest(value):
    return hashlib.sha256(value).hexdigest()

def tag(element):
    return element.tag.rsplit('}', 1)[-1]

def compact(value):
    return re.sub(r'\s+', ' ', value).strip()

def crossref(element):
    if tag(element) in ('strongsref', 'see'):
        prefix = {'GREEK': 'G', 'HEBREW': 'H'}.get(element.get('language', '').upper())
        number = element.get('strongs', '')
    elif tag(element) == 'w' and element.get('src'):
        prefix, number = 'H', element.get('src')
    else:
        return ''
    return f'{prefix}{int(number)}' if prefix and re.fullmatch(r'\d+', number or '') and int(number) else ''

def render(element):
    if element is None:
        return ''
    reference = crossref(element)
    if reference:
        lemma = element.get('lemma')
        return reference + (f' ({lemma})' if lemma else '')
    if tag(element) == 'greek':
        return element.get('unicode', '')
    if tag(element) == 'pronunciation':
        return element.get('strongs', '')
    if tag(element) == 'w' and element.get('lemma') and not element.text:
        return element.get('lemma')
    return (element.text or '') + ''.join(render(child) + (child.tail or '') for child in element)

def common(identifier, dictionary, language, lemma, transliteration, pronunciation, lexical_tag, definition, derivation, renderings, notes, related):
    value = {'id': identifier, 'dictionary': dictionary, 'language': language,
             'lemma': lemma, 'transliteration': transliteration, 'pronunciation': pronunciation,
             'lexicalTag': lexical_tag, 'definition': compact(definition), 'derivation': compact(derivation),
             'kjvRenderings': compact(renderings), 'notes': compact(notes), 'relatedIds': sorted(set(related))}
    value['entrySha256'] = digest(canonical(value).encode('utf8'))
    return value

def greek(root):
    entries = []
    for item in root.findall('./entries/entry'):
        head, pronunciation = item.find('greek'), item.find('pronunciation')
        extras = [item.text or '']
        for child in item:
            if child is not head and child is not pronunciation and tag(child) not in ('strongs', 'strongs_derivation', 'strongs_def', 'kjv_def', 'see'):
                extras.append(render(child))
            extras.append(child.tail or '')
        entries.append(common(f"G{int(item.get('strongs'))}", 'greek', 'grc',
            head.get('unicode', '') if head is not None else '', head.get('translit', '') if head is not None else '',
            pronunciation.get('strongs', '') if pronunciation is not None else '', '', render(item.find('strongs_def')),
            render(item.find('strongs_derivation')), render(item.find('kjv_def')), ''.join(extras),
            [crossref(child) for child in item.iter() if crossref(child)]))
    return entries

def hebrew(root):
    entries = []
    for item in root.findall('.//s:div[@type="entry"]', NS):
        head = item.find('s:w[@ID]', NS)
        if head is None:
            raise ValueError('Hebrew headword identity missing.')
        notes = {kind: item.find(f's:note[@type="{kind}"]', NS) for kind in ('explanation', 'exegesis', 'translation')}
        # The source's own XSLT maps POS to pronunciation. It is NOT a part-of-speech tag.
        # morph is retained separately as an untranslated dictionary-headword tag only.
        related = [crossref(child) for note in notes.values() if note is not None for child in note.iter() if crossref(child)]
        entries.append(common(head.get('ID'), 'hebrew', head.get(XML_LANG, 'und'), head.get('lemma', ''),
            head.get('xlit', ''), head.get('POS', ''), head.get('morph', ''), render(notes['explanation']),
            render(notes['exegesis']), render(notes['translation']),
            ' '.join(render(note) for note in item.findall('s:note[@type="x-typo"]', NS)), related))
    return entries

def verify():
    manifest = json.loads((OUT / 'manifest.json').read_text())
    assert manifest['sourceCommit'] == COMMIT and manifest['schemaVersion'] == 1
    ids = set()
    for source in manifest['dictionaries']:
        raw = (OUT / source['path']).read_bytes()
        assert digest(raw) == source['dataSha256'], f"Changed lexicon asset: {source['path']}"
        value = json.loads(raw)
        assert value['sourceSha256'] == SOURCES[source['id']][1]
        assert len(value['entries']) == source['records']
        for entry in value['entries']:
            assert entry['id'] not in ids and re.fullmatch(r'[GH][1-9]\d{0,3}', entry['id'])
            ids.add(entry['id'])
            payload = {key: value for key, value in entry.items() if key != 'entrySha256'}
            assert digest(canonical(payload).encode('utf8')) == entry['entrySha256'], f"Changed entry: {entry['id']}"
    assert len(ids) == manifest['totalRecords'] == 14298
    print(f"Verified {len(ids)} pinned historical lexicon records; no verse alignment or modern review asserted.")

def build(source_dir):
    OUT.mkdir(parents=True, exist_ok=True)
    descriptors, notices = [], []
    for name, (path, expected_hash) in SOURCES.items():
        raw = (source_dir / path).read_bytes()
        if digest(raw) != expected_hash:
            raise ValueError(f'Unverified source revision for {name}. Expected pinned SHA-256 {expected_hash}.')
        root = ET.fromstring(raw)
        if name == 'greek':
            notice = root.findtext('prologue')
            if 'Public Domain -- Copy Freely' not in notice:
                raise ValueError('Greek public-domain statement missing.')
            entries, title, original, digital = greek(root), "Strong's Dictionary of Greek Words", '1890', 'XML 1.4, 2007-09-14; XML e-text prepared in 2006'
            credit = 'James Strong; ASCII e-text by Michael Grier; Greek XML e-text by Ulrik Petersen; source hosted by Open Scriptures.'
        else:
            work = root.find('.//s:work[@osisWork="Strong"]', NS)
            if work.findtext('s:rights', namespaces=NS) != 'Public Domain':
                raise ValueError('Hebrew public-domain statement missing.')
            notice = ET.tostring(work, encoding='unicode')
            entries, title, original, digital = hebrew(root), "Strong's Hebrew and Aramaic Dictionary", '1894', 'XML revisions through 2010-05-24'
            credit = 'James Strong; Hebrew XML edited by David Troidl and David Instone-Brewer; source hosted by Open Scriptures.'
        data = {'schemaVersion': 1, 'dictionaryId': name, 'sourceSha256': expected_hash, 'entries': entries}
        encoded = (canonical(data) + '\n').encode('utf8')
        (OUT / f'{name}.json').write_bytes(encoded)
        descriptors.append({'id': name, 'title': title, 'path': f'{name}.json', 'records': len(entries),
            'headwords': sum(bool(entry['lemma']) for entry in entries), 'languageCounts': {language: sum(entry['language'] == language for entry in entries) for language in sorted({entry['language'] for entry in entries})},
            'sourceUrl': BASE + path, 'sourceSha256': expected_hash, 'dataSha256': digest(encoded),
            'originalDate': original, 'digitalEdition': digital, 'license': 'Public domain (source XML statement)',
            'attribution': credit})
        notices.append(f'{title}\nSource: {BASE + path}\nSHA-256: {expected_hash}\n\n{notice.strip()}')
    manifest = {'schemaVersion': 1, 'sourceRepository': 'https://github.com/openscriptures/strongs', 'sourceCommit': COMMIT,
        'totalRecords': sum(source['records'] for source in descriptors), 'dictionaries': descriptors,
        'normalization': ['Independently parsed the pinned public-domain XML, not the separately licensed JavaScript/JSON derivatives.',
            'Normalized presentation whitespace; preserved source lemma, transliteration, pronunciation, definitions, derivation and KJV-rendering wording.',
            'Expanded inline lexical reference elements to Strong IDs; retained source-supplied cross references.',
            'Hebrew import excludes foreign-word lists, numbered expanded gloss lists and TWOT metadata; only Strong headword and Strong notes are included.',
            'Greek unused-number records and missing fields remain explicit; no definitions are invented.',
            'Dictionary-level grammatical tags are not verse-level morphology or alignment. No Bible wording has been tagged or changed.'],
        'limitations': ['Historical dictionaries dated 1890 and 1894; vocabulary and interpretations can differ from current linguistic scholarship.',
            'English glosses are not approved equivalents for every occurrence. Context and grammar must be reviewed independently.',
            'No verse token alignment, interlinear, manuscript apparatus, modern audio, or reviewer-certified translation alternatives are installed by this import.']}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (OUT / 'NOTICE.txt').write_text('\n\n'.join(notices) + '\n\nAdigun-AiBible normalization: see manifest.json. Public-domain XML source statements apply to these imported dictionary texts. No third-party JavaScript implementation or copyrighted TWOT content is included.\n')
    verify()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        verify()
    elif args.source_dir:
        build(args.source_dir)
    else:
        parser.error('Supply --source-dir at the pinned source revision, or --verify.')
