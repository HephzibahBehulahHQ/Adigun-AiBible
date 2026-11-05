"""Synthetic negative cases and actual pinned-format checks for this source batch."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('edition_importer', ROOT / 'scripts/import-editions.py')
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)
IDS = ['fra-ostervald', 'epo-londona', 'arb-vandyck', 'mya-judson1840', 'nld-1917', 'haw-1868',
       'rus-synodal', 'ukr-kulish1905', 'vie-cadman', 'srp-danicic-karadzic', 'ton-revised-west', 'eng-geneva1599']


class ClassicalBatchChecks(unittest.TestCase):
    def test_whole_format_inventories_are_pinned(self):
        for edition in IDS:
            with self.subTest(edition=edition):
                provenance = json.loads((ROOT / 'data/editions' / edition / 'provenance.json').read_text())
                differences = provenance['publisherBracketFormatDifferences']
                IMPORTER.verify_vpl_format_inventory(edition, differences)
                changed = copy.deepcopy(differences)
                if changed:
                    changed[0]['bracketPositions'][0]['offset'] += 1
                else:
                    changed.append({'bookId': 'GEN', 'chapter': 1, 'verse': 1})
                with self.assertRaisesRegex(ValueError, 'exception inventory changed'):
                    IMPORTER.verify_vpl_format_inventory(edition, changed)

    def test_tongan_padding_is_exactly_one_source_record_and_never_changes_display(self):
        edition = 'ton-revised-west'
        text = 'Pea ʻi heʻene nofo ʻi he moʻunga ʻoe ʻOlive, ʻo hangatonu ki he falelotu lahi, naʻe fehuʻi fakafufū kiate ia ʻa Pita mo Semisi mo Sione mo ʻAnitelū, [ʻo pehē! ]'
        xml = 'Pea ʻi heʻene nofo ʻi he moʻunga ʻoe ʻOlive, ʻo hangatonu ki he falelotu lahi, naʻe fehuʻi fakafufū kiate ia ʻa Pita mo Semisi mo Sione mo ʻAnitelū, ʻo pehē!'
        reference = {'bookId': 'MRK', 'chapter': 13, 'verse': 3, 'editionId': edition}
        left, right = {**reference, 'text': xml}, {**reference, 'text': text}
        original = copy.deepcopy(right)
        receipt = IMPORTER.vpl_format_difference(edition, left, right)
        self.assertEqual(right, original)
        self.assertEqual(receipt['publisherPaddingPositions'], [{'offset': len(text) - 2, 'character': ' '}])
        for changed_left, changed_right in [
            ({**left, 'verse': 4}, {**right, 'verse': 4}),
            (left, {**right, 'text': text.replace('! ]', '!  ]')}),
            ({**left, 'text': xml.replace('Pita', 'changed')}, right),
            (left, {**right, 'text': text.replace('Pita', 'changed')}),
        ]:
            with self.assertRaises(ValueError):
                IMPORTER.vpl_format_difference(edition, changed_left, changed_right)
        with self.assertRaises(ValueError):
            IMPORTER.vpl_format_difference('epo-londona', left, right)

    def test_raw_notice_bytes_and_unicode_survive_the_importer(self):
        edition = 'fra-ostervald'
        source = copy.deepcopy(IMPORTER.SOURCES[edition])
        text = 'TEST e\u0301 — العربية ʻOlelo'
        xml = f'<verseFile><v b="GEN" c="1" v="1">{text}</v></verseFile>'.encode()
        plain = f'GEN 1:1 {text}\n'.encode()
        notice = b'<p>TEST fixture notice <a href="https://example.invalid/credit">credit</a></p>\r\n'
        source.update(expectedTotals={'books': 1, 'chapters': 1, 'verses': 1}, xmlSha256=IMPORTER.sha(xml),
                      textSha256=IMPORTER.sha(plain), noticeSha256=IMPORTER.sha(notice),
                      bracketExceptionCount=0, bracketExceptionInventorySha256=IMPORTER.sha(IMPORTER.json_bytes([])))
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, 'w') as archive:
            for suffix, content in [('vpl.xml', xml), ('vpl.txt', plain), ('about.htm', notice)]:
                archive.writestr(f'fra_fob_{suffix}', content)
        with patch.dict(IMPORTER.SOURCES, {edition: source}), patch.object(IMPORTER, 'BOOKS', [('GEN', 'Genesis')]):
            files = IMPORTER.build_artifacts(edition, raw.getvalue())
        self.assertEqual(files['SOURCE_NOTICE.html.txt'], notice)
        self.assertEqual(json.loads(files['books/GEN.json'])['chapters'][0]['verses'][0]['text'], text)
        self.assertEqual(json.loads(files['manifest.json'])['edition']['nativeTitle'], source['nativeTitle'])
        self.assertEqual(json.loads(files['provenance.json'])['generatedFileSha256']['SOURCE_NOTICE.html.txt'], IMPORTER.sha(notice))

    def test_archive_and_member_changes_fail_closed(self):
        with tempfile.TemporaryDirectory(prefix='classical-source-pin-') as folder:
            directory = Path(folder)
            for edition in IDS:
                (directory / f'{edition}.zip').write_bytes(b'TEST changed source archive')
                with self.assertRaisesRegex(ValueError, 'archive checksum mismatch'):
                    IMPORTER.archive_bytes(edition, directory)
        with self.assertRaisesRegex(ValueError, 'outside the Git repository'):
            IMPORTER.archive_bytes(IDS[0], ROOT / 'data')
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, 'w') as archive:
            archive.writestr('fra_fob_vpl.xml', '<verseFile/>')
        with zipfile.ZipFile(io.BytesIO(raw.getvalue())) as archive:
            with self.assertRaisesRegex(ValueError, 'member checksum mismatch'):
                IMPORTER.member(archive, 'fra_fob_vpl.xml', IMPORTER.SOURCES[IDS[0]]['xmlSha256'])


if __name__ == '__main__':
    unittest.main()
