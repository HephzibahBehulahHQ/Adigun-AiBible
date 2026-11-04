"""Deliberate parser fixtures only; never a production scripture source."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('edition_importer', ROOT / 'scripts/import-editions.py')
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class SourceImportChecks(unittest.TestCase):
    def setUp(self):
        self.books = IMPORTER.BOOKS
        IMPORTER.BOOKS = [('GEN', 'Test fixture book')]
        IMPORTER.SOURCES['test-fixture'] = {**copy.deepcopy(IMPORTER.SOURCES['eng-bsb']),
                                            'expectedTotals': {'books': 1, 'chapters': 1, 'verses': 2}}
        self.document = {'type': 'USJ', 'version': '3.0', 'content': [
            {'type': 'book', 'marker': 'id', 'code': 'GEN', 'content': ['TEST FIXTURE']},
            {'type': 'chapter', 'marker': 'c', 'number': '1', 'sid': 'GEN 1'},
            {'type': 'para', 'marker': 's1', 'content': ['TEST FIXTURE HEADING']},
            {'type': 'para', 'marker': 'p', 'content': [
                {'type': 'verse', 'marker': 'v', 'number': '1', 'sid': 'GEN 1:1'}, 'Test ',
                {'type': 'char', 'marker': 'wj', 'content': ['quoted àánú']},
                {'type': 'note', 'marker': 'f', 'caller': '+', 'content': [{'type': 'char', 'marker': 'ft', 'content': ['TEST NOTE']}]}, '.']},
            {'type': 'para', 'marker': 'q1', 'content': ['Second paragraph.']},
            {'type': 'para', 'marker': 'p', 'content': [
                {'type': 'verse', 'marker': 'v', 'number': '3', 'sid': 'GEN 1:3'}, 'Explicitly numbered third fixture unit.']},
        ]}

    def tearDown(self):
        IMPORTER.BOOKS = self.books
        del IMPORTER.SOURCES['test-fixture']

    def parse(self, document=None):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr('GEN.usj', json.dumps(document or self.document, ensure_ascii=False))
        with zipfile.ZipFile(io.BytesIO(stream.getvalue())) as archive:
            return IMPORTER.usj_bible_artifacts('test-fixture', archive)

    def test_source_words_gaps_notes_poetry_and_character_offsets_are_preserved(self):
        files, provenance = self.parse()
        book = json.loads(files['books/GEN.json'])
        chapter = book['chapters'][0]
        verse = chapter['verses'][0]
        self.assertEqual(verse['text'], 'Test quoted àánú. Second paragraph.')
        self.assertEqual([unit['number'] for unit in chapter['verses']], [1, 3])
        self.assertEqual(verse['notes'][0]['text'], 'TEST NOTE')
        self.assertEqual(chapter['headings'][0]['text'], 'TEST FIXTURE HEADING')
        span = verse['characterSpans'][0]
        self.assertEqual(verse['text'][span['start']:span['end']], 'quoted àánú')
        self.assertEqual(chapter['paragraphs'][1]['style'], 'q1')
        self.assertEqual(provenance['omittedNumberedPositions'][0]['verseNumbers'], [2])
        chunk = json.loads(files['chapters/GEN/1.json'])
        self.assertEqual(chunk['verses'], chapter['verses'])
        self.assertEqual(provenance['annotationTotals']['notes'], 1)

    def test_duplicate_range_and_wrong_identity_fail_instead_of_renumbering(self):
        for number, sid in [('1', 'GEN 1:1'), ('2-3', 'GEN 1:2-3'), ('3', 'EXO 1:3')]:
            source = copy.deepcopy(self.document)
            source['content'][-1]['content'][0].update(number=number, sid=sid)
            with self.assertRaises(ValueError):
                self.parse(source)

    def test_unknown_structure_is_not_silently_discarded(self):
        source = copy.deepcopy(self.document)
        source['content'][-1]['marker'] = 'unreviewed-layout'
        with self.assertRaisesRegex(ValueError, 'Unsupported USJ paragraph'):
            self.parse(source)

    def test_changed_archive_is_rejected_before_generation(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, 'eng-bsb.zip').write_bytes(b'TEST FIXTURE: changed archive')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                IMPORTER.archive_bytes('eng-bsb', Path(folder))


if __name__ == '__main__':
    unittest.main()
