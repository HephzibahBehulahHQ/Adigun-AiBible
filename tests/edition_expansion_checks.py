"""Focused source-fidelity checks for the nine individually pinned VPL imports."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('edition_importer', ROOT / 'scripts/import-editions.py')
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)
IDS = ['eng-ylt', 'eng-dby', 'eng-webster', 'fra-lsg1910', 'spa-rv1909',
       'deu-elberfelder1905', 'deu-textbibel1906', 'ces-kralicka1613', 'ita-diodati1885']


class ExpansionChecks(unittest.TestCase):
    def test_every_recorded_bracket_inventory_is_pinned_to_its_source(self):
        for edition_id in IDS:
            with self.subTest(edition_id=edition_id):
                provenance = json.loads((ROOT / 'data/editions' / edition_id / 'provenance.json').read_text())
                differences = provenance['publisherBracketFormatDifferences']
                IMPORTER.verify_vpl_format_inventory(edition_id, differences)
                changed = copy.deepcopy(differences)
                if changed:
                    changed[0]['bracketPositions'][0]['offset'] += 1
                else:
                    changed.append({'bookId': 'GEN', 'chapter': 1, 'verse': 1})
                with self.assertRaisesRegex(ValueError, 'exception inventory changed'):
                    IMPORTER.verify_vpl_format_inventory(edition_id, changed)

    def test_source_specific_brackets_never_change_the_display_text(self):
        for edition_id in IDS:
            row = {'bookId': 'GEN', 'chapter': 1, 'verse': 1, 'editionId': edition_id}
            xml = {**row, 'text': 'TEST naïve é WORDS'}
            txt = {**row, 'text': 'TEST naïve [é] WORDS'}
            original = copy.deepcopy(txt)
            if IMPORTER.SOURCES[edition_id]['bracketExceptionCount']:
                difference = IMPORTER.vpl_format_difference(edition_id, xml, txt)
                self.assertEqual(difference['publisherMarkers'], ['[é]'])
                self.assertEqual(txt, original)
            else:
                with self.assertRaisesRegex(ValueError, 'source-specific bracket'):
                    IMPORTER.vpl_format_difference(edition_id, xml, txt)
            with self.assertRaisesRegex(ValueError, 'source-specific bracket'):
                IMPORTER.vpl_format_difference(edition_id, {**xml, 'text': 'TEST changed WORDS'}, txt)

    def test_archive_and_member_hashes_fail_closed(self):
        with tempfile.TemporaryDirectory(prefix='edition-source-pin-') as temporary:
            directory = Path(temporary)
            for edition_id in IDS:
                (directory / f'{edition_id}.zip').write_bytes(b'TEST changed source archive')
                with self.assertRaisesRegex(ValueError, 'archive checksum mismatch'):
                    IMPORTER.archive_bytes(edition_id, directory)
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, 'w') as archive:
            archive.writestr('engDBY_vpl.xml', '<verseFile/>')
        with zipfile.ZipFile(io.BytesIO(raw.getvalue())) as archive:
            with self.assertRaisesRegex(ValueError, 'member checksum mismatch'):
                IMPORTER.member(archive, 'engDBY_vpl.xml', IMPORTER.SOURCES['eng-dby']['xmlSha256'])

    def test_provider_member_name_and_unicode_are_preserved_separately_from_app_id(self):
        edition_id = 'fra-lsg1910'
        source = copy.deepcopy(IMPORTER.SOURCES[edition_id])
        xml = '<verseFile><v b="GEN" c="1" v="1">TEST lumière — é</v></verseFile>'.encode()
        txt = 'GEN 1:1 TEST lumière — é\n'.encode()
        notice = b'<p>TEST fixture notice</p>'
        source.update({'expectedTotals': {'books': 1, 'chapters': 1, 'verses': 1},
                       'xmlSha256': IMPORTER.sha(xml), 'textSha256': IMPORTER.sha(txt),
                       'noticeSha256': IMPORTER.sha(notice), 'bracketExceptionCount': 0,
                       'bracketExceptionInventorySha256': IMPORTER.sha(IMPORTER.json_bytes([]))})
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, 'w') as archive:
            for suffix, content in [('vpl.xml', xml), ('vpl.txt', txt), ('about.htm', notice)]:
                archive.writestr(f'fraLSG_{suffix}', content)
        with patch.dict(IMPORTER.SOURCES, {edition_id: source}), patch.object(IMPORTER, 'BOOKS', [('GEN', 'Genesis')]):
            files = IMPORTER.build_artifacts(edition_id, raw.getvalue())
        self.assertEqual(json.loads(files['books/GEN.json'])['chapters'][0]['verses'][0]['text'], 'TEST lumière — é')
        self.assertEqual(json.loads(files['search-index.json'])[0]['editionId'], edition_id)
        self.assertEqual(json.loads(files['provenance.json'])['displayTextMember'], 'fraLSG_vpl.txt')


if __name__ == '__main__':
    unittest.main()
