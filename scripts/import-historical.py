#!/usr/bin/env python3
"""Reproduce the pinned, source-derived Didache transcription. No generated text."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = ROOT / 'data' / 'historical'
SOURCE = 'https://en.wikisource.org/w/index.php?title=Didache_(Lightfoot_translation)&oldid=14637905'
REVISION = 'wikisource-14637905'
EXPECTED_UNITS = [23, 7, 16, 20, 6, 6, 7, 11, 12, 15, 21, 8, 8, 5, 7, 17]
EXPECTED_SHA256 = '328c82f7dc9e676b0bfe50b9edda620e905ad7ca549cfc7c5a281726d7fb3159'


class DidacheParser(HTMLParser):
    """Read only numbered units inside the source's sixteen chapter sections."""
    def __init__(self):
        super().__init__()
        self.heading = None
        self.chapter = 0
        self.paragraph = False
        self.superscript = None
        self.unit = None
        self.buffer = []
        self.chapters = []

    def flush(self):
        if self.unit is not None:
            text = ' '.join(''.join(self.buffer).split())
            if not text:
                raise ValueError('Empty source unit')
            self.chapters[-1]['units'].append({'number': self.unit, 'text': text})
        self.buffer = []
        self.unit = None

    def handle_starttag(self, tag, attrs):
        if tag == 'h2':
            self.heading = []
        if tag == 'p' and self.chapter:
            self.paragraph = True
        if tag == 'sup' and self.paragraph:
            self.flush()
            self.superscript = []

    def handle_endtag(self, tag):
        if tag == 'h2' and self.heading is not None:
            match = re.match(r'Chapter (\d+)', ''.join(self.heading))
            self.chapter = int(match.group(1)) if match else 0
            if self.chapter:
                self.chapters.append({'number': self.chapter, 'units': []})
            self.heading = None
        if tag == 'sup' and self.superscript is not None:
            number = ''.join(self.superscript).strip()
            if not number.isdigit():
                raise ValueError('Unexpected source superscript; inspect the upstream revision')
            self.unit = int(number)
            self.superscript = None
        if tag == 'p' and self.paragraph:
            self.flush()
            self.paragraph = False

    def handle_data(self, data):
        if self.heading is not None:
            self.heading.append(data)
        elif self.superscript is not None:
            self.superscript.append(data)
        elif self.paragraph:
            self.buffer.append(data)


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def validate(work):
    if work.get('schemaVersion') != 1 or work.get('editionId') != 'didache-lightfoot' or work.get('sourceRevision') != REVISION:
        raise ValueError('Wrong historical edition identity')
    chapters = work.get('chapters', [])
    if [chapter['number'] for chapter in chapters] != list(range(1, 17)):
        raise ValueError('Missing or duplicate historical chapters')
    if [len(chapter['units']) for chapter in chapters] != EXPECTED_UNITS:
        raise ValueError('Source unit inventory changed')
    for chapter in chapters:
        if [unit['number'] for unit in chapter['units']] != list(range(1, len(chapter['units']) + 1)):
            raise ValueError('Missing or duplicate source units')
        if any(not isinstance(unit.get('text'), str) or not unit['text'].strip() for unit in chapter['units']):
            raise ValueError('Empty source text')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--source', type=Path, help='HTML downloaded from the pinned source URL')
    group.add_argument('--fetch', action='store_true', help='Fetch that exact Wikisource revision')
    group.add_argument('--verify', action='store_true', help='Verify the checked-in work and edition manifest without network access')
    args = parser.parse_args()
    manifest_path = DIRECTORY / 'manifest.json'
    target = DIRECTORY / 'didache-lightfoot.json'
    if args.verify:
        raw = target.read_bytes()
        work = json.loads(raw)
        validate(work)
        manifest = json.loads(manifest_path.read_text())
        edition = next(item for item in manifest['editions'] if item['id'] == work['editionId'])
        if digest(raw) != EXPECTED_SHA256 or digest(raw) != edition['sha256'] or len(raw) != edition['bytes'] or edition['units'] != sum(EXPECTED_UNITS):
            raise ValueError('Historical source checksum or coverage mismatch')
        if not (ROOT / edition['noticePath']).is_file():
            raise ValueError('Historical source notice is missing')
        print('Verified Didache: 16 chapters, 189 numbered source units and unchanged source checksum.')
        return
    raw = urlopen(Request(SOURCE, headers={'User-Agent': 'Adigun-AiBible historical-source importer'}), timeout=30).read() if args.fetch else args.source.read_bytes()
    if len(raw) > 2_000_000:
        raise ValueError('Source document exceeds the import limit')
    html = raw.decode('utf-8')
    if 'Didache' not in html or '14637905' not in html:
        raise ValueError('The supplied document is not the pinned source revision')
    parsed = DidacheParser()
    parsed.feed(html)
    work = {'schemaVersion': 1, 'id': 'didache', 'title': 'Didache', 'editionId': 'didache-lightfoot', 'language': 'en', 'sourceRevision': REVISION, 'chapters': parsed.chapters}
    validate(work)
    output = encode(work)
    if digest(output) != EXPECTED_SHA256:
        raise ValueError('The extracted source wording or numbering differs from the verified import. Do not silently replace the edition.')
    if target.exists() and target.read_bytes() != output:
        raise ValueError('Pinned source wording differs from the installed edition; create and review a new revision instead of overwriting it')
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    target.write_bytes(output)
    print(json.dumps({'path': str(target.relative_to(ROOT)), 'sha256': digest(output), 'bytes': len(output), 'sourceHtmlSha256': digest(raw), 'chapters': 16, 'units': sum(EXPECTED_UNITS)}))


if __name__ == '__main__':
    main()
