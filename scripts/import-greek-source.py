#!/usr/bin/env python3
"""Reproduce the pinned MorphGNT SBLGNT corpus, using only the standard library.

The source supplies seven literal fields per word. No Unicode normalization,
new reading, annotation correction, translated alignment or gloss is performed.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tarfile
import tempfile
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'data/original-language/morphgnt-sblgnt'
SOURCE_ID = 'morphgnt-sblgnt'
REVISION = 'aaed91e57c8e4a8dc9a2383e129ca5e75fe6393d'
MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
MAX_EXPANDED_BYTES = 64 * 1024 * 1024
MAX_MEMBER_BYTES = 8 * 1024 * 1024
MAX_MEMBERS = 2048
BOOKS = [
    ('Mt', 'Matthew'), ('Mk', 'Mark'), ('Lk', 'Luke'), ('Jn', 'John'),
    ('Ac', 'Acts'), ('Ro', 'Romans'), ('1Co', '1 Corinthians'),
    ('2Co', '2 Corinthians'), ('Ga', 'Galatians'), ('Eph', 'Ephesians'),
    ('Php', 'Philippians'), ('Col', 'Colossians'), ('1Th', '1 Thessalonians'),
    ('2Th', '2 Thessalonians'), ('1Ti', '1 Timothy'), ('2Ti', '2 Timothy'),
    ('Tit', 'Titus'), ('Phm', 'Philemon'), ('Heb', 'Hebrews'), ('Jas', 'James'),
    ('1Pe', '1 Peter'), ('2Pe', '2 Peter'), ('1Jn', '1 John'),
    ('2Jn', '2 John'), ('3Jn', '3 John'), ('Jud', 'Jude'), ('Re', 'Revelation'),
]
TOKEN_FIELDS = ('partOfSpeech', 'parsing', 'text', 'word', 'normalized', 'lemma')


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_object(kind: str, data: bytes) -> bytes:
    return hashlib.sha1(kind.encode() + b' ' + str(len(data)).encode() + b'\0' + data).digest()


def json_bytes(value: object, pretty: bool = False) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2 if pretty else None,
                       separators=None if pretty else (',', ':')) + '\n').encode('utf-8')


def file_pin(path: str, data: bytes) -> dict:
    return {'path': path, 'bytes': len(data), 'sha256': sha256(data)}


def verify_bytes(data: bytes, pin: dict, label: str, git: bool = False) -> None:
    if len(data) != pin['bytes'] or sha256(data) != pin['sha256']:
        raise ValueError(f'Pinned byte length/SHA-256 differs: {label}')
    if git and git_object('blob', data).hex() != pin['gitBlobSha']:
        raise ValueError(f'Pinned Git blob differs: {label}')


def git_tree(files: dict[str, tuple[str, bytes]]) -> str:
    """Reconstruct the complete upstream tree; directories sort with a slash."""
    def tree(prefix: str) -> bytes:
        entries = {}
        for path, value in files.items():
            if not path.startswith(prefix):
                continue
            relative = path[len(prefix):]
            if '/' in relative:
                entries[relative.split('/')[0] + '/'] = None
            else:
                entries[relative] = value
        chunks = []
        for name, value in sorted(entries.items()):
            if value is None:
                mode, label, digest = '40000', name[:-1], tree(prefix + name)
            else:
                mode, data = value
                label, digest = name, git_object('blob', data)
            chunks.append(mode.encode() + b' ' + label.encode() + b'\0' + digest)
        return git_object('tree', b''.join(chunks))
    return tree('').hex()


def archive_members(data: bytes, prefix: str) -> dict[str, tuple[str, bytes]]:
    """Never extract paths. Reject traversal, links, duplicates and expansion bombs."""
    if len(data) > MAX_ARCHIVE_BYTES:
        raise ValueError('Archive exceeds the compressed-byte bound')
    result, seen, total = {}, set(), 0
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for index, member in enumerate(archive, 1):
            if index > MAX_MEMBERS:
                raise ValueError('Archive exceeds the member-count bound')
            path = member.name
            parts = PurePosixPath(path).parts
            if (path.startswith('/') or '\\' in path or '..' in parts
                    or path in seen or any(ord(char) < 32 for char in path)):
                raise ValueError('Unsafe or duplicate archive member')
            seen.add(path)
            if path == prefix.rstrip('/') and member.isdir():
                continue
            if not path.startswith(prefix):
                raise ValueError('Unexpected archive root')
            relative = path[len(prefix):]
            if not relative or relative != str(PurePosixPath(relative)):
                raise ValueError('Noncanonical archive path')
            if member.isdir():
                continue
            if not member.isfile():
                raise ValueError('Archive links and special members are not admitted')
            total += member.size
            if member.size < 0 or member.size > MAX_MEMBER_BYTES or total > MAX_EXPANDED_BYTES:
                raise ValueError('Archive exceeds the expanded-byte bound')
            handle = archive.extractfile(member)
            if handle is None:
                raise ValueError('Unreadable source member')
            content = handle.read(member.size + 1)
            if len(content) != member.size:
                raise ValueError('Truncated source member')
            result[relative] = ('100755' if member.mode & 0o111 else '100644', content)
    if not result:
        raise ValueError('Empty source archive')
    # A path must not be both a file and an ancestor directory.
    for path in result:
        if any(str(parent) in result for parent in PurePosixPath(path).parents):
            raise ValueError('Archive file/directory collision')
    return result


def read_archive(path: Path, upstream: dict, selected: list[dict]) -> dict[str, bytes]:
    if path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError('Archive exceeds the compressed-byte bound')
    data = path.read_bytes()
    verify_bytes(data, {'bytes': upstream['archiveBytes'], 'sha256': upstream['archiveSha256']}, 'archive')
    files = archive_members(data, upstream['archivePrefix'])
    if git_tree(files) != upstream['tree']:
        raise ValueError('Complete archive Git tree differs from the pinned upstream commit')
    result = {}
    for pin in selected:
        if pin['path'] in result or pin['path'] not in files:
            raise ValueError('Duplicate or missing pinned source file')
        content = files[pin['path']][1]
        verify_bytes(content, pin, pin['path'], git=True)
        result[pin['path']] = content
    return result


def acquire(path: Path | None, url: str, expected: dict, name: str) -> Path:
    if path is not None:
        return path
    if not 0 < expected['bytes'] <= MAX_ARCHIVE_BYTES or not url.startswith('https://'):
        raise ValueError('Invalid bounded source download pin')
    target = Path(tempfile.gettempdir()) / 'adigun-greek-source' / (expected['sha256'] + '-' + name)
    if target.exists():
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'Adigun-AiBible pinned source importer'})
    with urllib.request.urlopen(request, timeout=45) as response:
        declared = response.headers.get('Content-Length')
        if declared is not None and (not declared.isdecimal() or int(declared) > expected['bytes']):
            raise ValueError('Source download declares more than its pinned bytes')
        data = response.read(expected['bytes'] + 1)
    verify_bytes(data, expected, name)
    target.write_bytes(data)
    return target


def parse_book(data: bytes, index: int, abbreviation: str, name: str) -> dict:
    if not data or not data.endswith(b'\n') or b'\r' in data or len(data) > MAX_MEMBER_BYTES:
        raise ValueError('Expected a bounded, nonempty UTF-8 source with literal LF endings')
    text = data.decode('utf-8', errors='strict')
    chapters, previous = [], ''
    source_book = f'{index:02}'
    for line_number, line in enumerate(text[:-1].split('\n'), 1):
        fields = line.split(' ')
        if (len(fields) != 7 or any(not value or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in value) for value in fields)
                or len(line.encode('utf-8')) > 4096):
            raise ValueError(f'Invalid seven-field source row at line {line_number}')
        reference, pos, parsing, *_ = fields
        if (not re.fullmatch(r'[0-9]{6}', reference) or reference[:2] != source_book
                or int(reference[2:4]) == 0 or int(reference[4:]) == 0 or reference < previous):
            raise ValueError(f'Invalid, wrong-book or out-of-order source reference: {reference}')
        # Unknown letters are preserved; structural length/character corruption is rejected.
        if not re.fullmatch(r'[A-Z-]{2}', pos) or not re.fullmatch(r'[A-Z0-9-]{8}', parsing):
            raise ValueError(f'Invalid source morphology field shape at line {line_number}')
        chapter_number, verse_number = str(int(reference[2:4])), str(int(reference[4:]))
        if not chapters or chapters[-1]['number'] != chapter_number:
            chapters.append({'number': chapter_number, 'sourcePrefix': reference[:4], 'verses': []})
        verses = chapters[-1]['verses']
        if not verses or verses[-1]['reference'] != reference:
            verses.append({'number': verse_number, 'reference': reference, 'tokens': []})
        tokens = verses[-1]['tokens']
        tokens.append({'sourceLine': line_number, 'ordinal': len(tokens) + 1,
                       **dict(zip(TOKEN_FIELDS, fields[1:]))})
        previous = reference
    return {'schemaVersion': 1, 'sourceId': SOURCE_ID, 'sourceRevision': REVISION,
            'book': abbreviation, 'name': name, 'sourceBookNumber': source_book,
            'sourceFile': f'{60 + index}-{abbreviation}-morphgnt.txt', 'chapters': chapters}


def roundtrip_book(book: dict) -> bytes:
    lines = []
    for chapter in book['chapters']:
        for verse in chapter['verses']:
            for ordinal, token in enumerate(verse['tokens'], 1):
                if token['sourceLine'] != len(lines) + 1 or token['ordinal'] != ordinal:
                    raise ValueError('Derived source-line or token order differs')
                lines.append(' '.join([verse['reference'], *(token[field] for field in TOKEN_FIELDS)]))
    return ('\n'.join(lines) + '\n').encode('utf-8')


def morphology_key(readme: bytes) -> dict:
    text = readme.decode('utf-8', errors='strict')
    pos_section = text.split('Part of Speech Code\n-------------------\n', 1)[1].split('Parsing Code', 1)[0]
    pos = dict(re.findall(r'^([A-Z-]{2}) (.+?)\s*$', pos_section, flags=re.MULTILINE))
    parsing_section = text.split('Parsing Code\n------------\n', 1)[1].split('\nNOTE:', 1)[0]
    positions = []
    for field, entries in re.findall(r'^ \* ([a-z]+) \((.+)\)$', parsing_section, flags=re.MULTILINE):
        descriptions = {}
        for entry in entries.split(', '):
            code, description = entry.split('=', 1)
            if len(code) != 1 or not description or code in descriptions:
                raise ValueError('Unsupported upstream morphology-key structure')
            descriptions[code] = description
        positions.append({'index': len(positions), 'name': field, 'codes': descriptions})
    if len(pos) != 13 or [p['name'] for p in positions] != ['person', 'tense', 'voice', 'mood', 'case', 'number', 'gender', 'degree']:
        raise ValueError('Pinned source morphology key is incomplete or changed')
    return {'schemaVersion': 1, 'sourceId': SOURCE_ID, 'sourceRevision': REVISION,
            'sourcePath': 'README.md', 'license': 'CC-BY-SA-3.0', 'partOfSpeech': pos,
            'positions': positions, 'placeholder': '-',
            'placeholderPolicy': 'A dash is retained as an unexpanded position; no grammatical meaning is inferred.',
            'limitations': 'Only descriptions printed in the pinned MorphGNT README are expanded. Unknown symbols stay raw. The upstream README says the inherited CCAT codes will be deprecated in a future major release.'}


def unknown_symbols(token: dict, grammar: dict) -> list[str]:
    result = []
    if token['partOfSpeech'] not in grammar['partOfSpeech']:
        result.append('partOfSpeech:' + token['partOfSpeech'])
    for index, symbol in enumerate(token['parsing']):
        field = grammar['positions'][index]
        if symbol != '-' and symbol not in field['codes']:
            result.append(field['name'] + ':' + symbol)
    return result


def verify_rights(sources: dict, text_sources: dict, annotation_license: bytes, pins: dict) -> None:
    readme = sources['README.md'].decode('utf-8')
    if ('http://creativecommons.org/licenses/by-sa/3.0/' not in readme
            or 'morphological parsing and lemmatization' not in readme
            or 'http://sblgnt.com/license/' not in readme):
        raise ValueError('MorphGNT text/annotation license split is not evidenced')
    text_notice = text_sources['README.md'].decode('utf-8')
    if ('https://creativecommons.org/licenses/by/4.0/' not in text_notice
            or 'Copyright 2010' not in text_notice
            or not text_sources['LICENSE'].startswith(b'Attribution 4.0 International')):
        raise ValueError('SBLGNT text license or copyright notice is missing')
    verify_bytes(annotation_license, pins['annotationLicenseDocument'], 'annotation license', git=True)
    if not annotation_license.startswith(b'Creative Commons Legal Code\n\nAttribution-ShareAlike 3.0 Unported'):
        raise ValueError('Annotation license document has the wrong identity')


def build(pins: dict, pin_bytes: bytes, sources: dict, text_sources: dict, annotation_license: bytes) -> dict[str, bytes]:
    if pins['id'] != SOURCE_ID or pins['upstream']['commit'] != REVISION:
        raise ValueError('Unsupported source identity/revision')
    verify_rights(sources, text_sources, annotation_license, pins)
    grammar = morphology_key(sources['README.md'])
    outputs = {
        'morphology.json': json_bytes(grammar, pretty=True),
        'notices/MorphGNT-README.md': sources['README.md'],
        'notices/SBLGNT-README.md': text_sources['README.md'],
        'notices/SBLGNT-About.md': text_sources['About.md'],
        'notices/CC-BY-4.0.txt': text_sources['LICENSE'],
        'notices/CC-BY-SA-3.0.txt': annotation_license,
    }
    books, pos_counts, parsing_counts, symbols, codes = [], Counter(), Counter(), Counter(), Counter()
    punctuation, lemmas, normalized = Counter(), set(), set()
    token_total = 0
    for index, (abbreviation, name) in enumerate(BOOKS, 1):
        source_path = f'{60 + index}-{abbreviation}-morphgnt.txt'
        original = sources[source_path]
        book = parse_book(original, index, abbreviation, name)
        if roundtrip_book(book) != original:
            raise ValueError('Source row roundtrip changed original bytes: ' + source_path)
        chapters, book_tokens = [], 0
        for chapter in book['chapters']:
            chapter_tokens = 0
            for verse in chapter['verses']:
                chapter_tokens += len(verse['tokens'])
                for token in verse['tokens']:
                    pos_counts[token['partOfSpeech']] += 1
                    parsing_counts[token['parsing']] += 1
                    missing = unknown_symbols(token, grammar)
                    symbols.update(missing)
                    if missing:
                        codes[token['parsing']] += 1
                    lemmas.add(token['lemma'])
                    normalized.add(token['normalized'])
                    punctuation.update(char for char in token['text'] if not (char.isalpha() or unicodedata.category(char).startswith('M')))
            book_tokens += chapter_tokens
            chapters.append({'number': chapter['number'], 'sourcePrefix': chapter['sourcePrefix'],
                             'verseNumbers': [v['number'] for v in chapter['verses']],
                             'verseCount': len(chapter['verses']), 'tokenCount': chapter_tokens})
        path = 'books/' + abbreviation + '.json'
        outputs[path] = json_bytes(book)
        token_total += book_tokens
        books.append({'id': abbreviation, 'name': name, 'sourceBookNumber': f'{index:02}',
                      **file_pin(path, outputs[path]), 'sourcePath': source_path,
                      'sourceBytes': len(original), 'sourceSha256': sha256(original),
                      'chapterCount': len(chapters), 'verseCount': sum(c['verseCount'] for c in chapters),
                      'tokenCount': book_tokens, 'chapters': chapters})
    manifest = {
        'schemaVersion': 1, 'sourceId': SOURCE_ID, 'title': 'MorphGNT: SBLGNT Edition',
        'sourceRevision': REVISION, 'sourceRepository': pins['upstream']['repository'],
        'sourcePinPath': 'source.json', 'language': 'grc', 'direction': 'ltr',
        'textLicense': 'CC-BY-4.0', 'annotationLicense': 'CC-BY-SA-3.0',
        'textAttribution': pins['license']['textAttribution'],
        'annotationAttribution': pins['license']['annotationAttribution'],
        'textLicenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
        'annotationLicenseUrl': 'https://creativecommons.org/licenses/by-sa/3.0/',
        'noticePaths': sorted(path for path in outputs if path.startswith('notices/')),
        'morphologyPath': 'morphology.json',
        'scope': 'The 27-book Greek New Testament word-row corpus at the pinned MorphGNT revision. A separate original-language resource, not a translated 66-book Bible edition.',
        'referenceSystem': 'Literal six-digit MorphGNT book/chapter/verse references. Book numbers 01–27 and source verse gaps are preserved. English names are navigation labels only.',
        'wordIdentity': 'No upstream word IDs are supplied. sourceFile + sourceLine is a derived row locator; ordinal is the one-based position within the represented source verse.',
        'normalization': 'None performed. text, word, normalized and lemma are separate literal upstream fields. The upstream normalized field is not substituted for display text. Original rows roundtrip byte-for-byte with ASCII spaces and LF endings.',
        'modifications': 'Lossless reformatting into JSON grouped by original source chapter/verse, with source-row locators and computed inventories. No text, lemma, parsing or reference correction.',
        'annotationStatus': 'Pinned upstream annotations, not independent linguistic or human editorial certification. Only the pinned README key supplies expansions; unknown codes remain raw.',
        'readingPolicy': 'All source punctuation, brackets, apparatus signs and normalized-form parentheses remain literal. The chosen seven-column source provides no full apparatus or alternative-reading records; no alternative is reconstructed or selected.',
        'sourceVersionLimit': 'This MorphGNT snapshot is not the newer Faithlife SBLGNT v1.2 corpus. John 7:53 and 8:1–11 are not represented in it; no missing source verse is manufactured.',
        'alignment': None, 'glosses': None, 'transliteration': None, 'audio': None,
        'alternativeReadings': None, 'strongs': None, 'humanEditorialApproval': False,
        'bookCount': len(books), 'chapterCount': sum(b['chapterCount'] for b in books),
        'verseCount': sum(b['verseCount'] for b in books), 'tokenCount': token_total,
        'uniqueLemmaCount': len(lemmas), 'uniqueNormalizedFormCount': len(normalized),
        'observedPartOfSpeech': dict(sorted(pos_counts.items())),
        'observedParsingCodes': dict(sorted(parsing_counts.items())),
        'unexpandedSymbols': dict(sorted(symbols.items())),
        'unexpandedParsingCodes': dict(sorted(codes.items())),
        'observedNonletterTextCodepoints': [{'codepoint': f'U+{ord(char):04X}', 'character': char, 'count': count}
                                          for char, count in sorted(punctuation.items())],
        'books': books,
        'outputs': [file_pin(path, data) for path, data in sorted(outputs.items())],
    }
    outputs['manifest.json'] = json_bytes(manifest, pretty=True)
    outputs['integrity.json'] = json_bytes({
        'schemaVersion': 1, 'sourceId': SOURCE_ID, 'sourceRevision': REVISION,
        'sourcePinSha256': sha256(pin_bytes),
        'files': [file_pin(path, data) for path, data in sorted(outputs.items())],
    }, pretty=True)
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Exact pinned MorphGNT tar.gz')
    parser.add_argument('--text-license-archive', type=Path, help='Exact pinned Faithlife/SBLGNT tar.gz (notices only are imported)')
    parser.add_argument('--annotation-license', type=Path, help='Exact pinned CC BY-SA 3.0 plain-text legal code')
    parser.add_argument('--check', action='store_true', help='Compare every generated byte without writing')
    args = parser.parse_args()
    pin_bytes = (DEST / 'source.json').read_bytes()
    pins = json.loads(pin_bytes)
    sources = []
    for path, upstream, files, name in [
        (args.archive, pins['upstream'], pins['sourceFiles'], 'morphgnt.tar.gz'),
        (args.text_license_archive, pins['textLicenseUpstream'], pins['textLicenseFiles'], 'text-license.tar.gz'),
    ]:
        archive_pin = {'bytes': upstream['archiveBytes'], 'sha256': upstream['archiveSha256']}
        actual = acquire(path, upstream['archiveUrl'], archive_pin, name)
        sources.append(read_archive(actual, upstream, files))
    license_pin = pins['annotationLicenseDocument']
    license_path = acquire(args.annotation_license, license_pin['rawUrl'], license_pin, 'CC-BY-SA-3.0.txt')
    if license_path.stat().st_size > 100_000:
        raise ValueError('Annotation license exceeds its bounded size')
    outputs = build(pins, pin_bytes, sources[0], sources[1], license_path.read_bytes())
    unexpected = {p.relative_to(DEST).as_posix() for p in DEST.rglob('*') if p.is_file()} - set(outputs) - {'source.json'}
    if unexpected:
        raise ValueError('Unexpected files in the generated corpus: ' + ', '.join(sorted(unexpected)))
    for relative, data in outputs.items():
        path = DEST / relative
        if args.check:
            if not path.exists() or path.read_bytes() != data:
                raise ValueError('Generated output differs from pinned source: ' + relative)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_name(path.name + '.tmp')
            temporary.write_bytes(data)
            temporary.replace(path)
    manifest = json.loads(outputs['manifest.json'])
    print(json.dumps({'verified' if args.check else 'generated': len(outputs),
                      'sourceRevision': REVISION, 'books': manifest['bookCount'],
                      'chapters': manifest['chapterCount'], 'verses': manifest['verseCount'],
                      'tokens': manifest['tokenCount'], 'unexpandedSymbols': manifest['unexpandedSymbols'],
                      'bytes': sum(map(len, outputs.values()))}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, IndexError, UnicodeError, OSError, tarfile.TarError) as error:
        print(f'Greek source import failed closed: {error}', file=sys.stderr)
        sys.exit(1)
