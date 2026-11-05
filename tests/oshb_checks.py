"""Adversarial synthetic fixtures for the preserving OSHB importer (no network)."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('oshb_import', ROOT / 'scripts/import-oshb.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture(body, book='Gen', chapter='1', verse='1'):
    return (f'<osis xmlns="{module.NS}"><osisText><header />'
            f'<div type="book" osisID="{book}"><chapter osisID="{book}.{chapter}">'
            f'<verse osisID="{book}.{chapter}.{verse}">{body}</verse>'
            '</chapter></div></osisText></osis>').encode()


class PreservationTests(unittest.TestCase):
    def test_written_and_multiword_reading_remain_separate(self):
        body = ('<w id="written" lemma="1" morph="HNp" type="x-ketiv">כתב</w>'
                '<note type="variant"><catchWord>כתב</catchWord><rdg type="x-qere">'
                '<w id="read1" lemma="2" morph="HNp">קרא</w> '
                '<w id="read2" lemma="3" morph="HNp">שני</w></rdg></note>')
        book = module.parse_book(fixture(body), 'Gen', 'Genesis', 'test')
        nodes = book['chapters'][0]['verses'][0]['content']
        self.assertEqual(nodes[0]['attributes']['id'], 'written')
        self.assertEqual(nodes[1]['content'][1]['content'][1], ' ')
        words = [(node['attributes']['id'], reading) for node, reading in module.walk_nodes(nodes) if node['tag'] == 'w']
        self.assertEqual(words, [('written', None), ('read1', 'x-qere'), ('read2', 'x-qere')])
        counts = module.node_counts(nodes)
        self.assertEqual((counts['mainTextWords'], counts['readingWords'], counts['ketivWords']), (1, 2, 1))

    def test_unicode_and_internal_segments_survive_without_normalization(self):
        source = '\u05d1\u05bc\u05b0'
        self.assertNotEqual(source, unicodedata.normalize('NFC', source))
        body = f'<w lemma="1" morph="HNp" id="a">{source}<seg type="x-large">ע</seg>ים</w>'
        word = module.parse_book(fixture(body), 'Gen', 'Genesis', 'test')['chapters'][0]['verses'][0]['content'][0]
        self.assertEqual(word['content'], [source, {'tag': 'seg', 'attributes': {'type': 'x-large'}, 'content': ['ע']}, 'ים'])

    def test_empty_and_missing_annotations_stay_unknown(self):
        nodes = module.parse_book(fixture('<w>א</w><w id="" lemma="" morph="">ב</w>'), 'Gen', 'Genesis', 'test')['chapters'][0]['verses'][0]['content']
        self.assertEqual(nodes[0]['attributes'], {})
        self.assertEqual(nodes[1]['attributes'], {'id': '', 'lemma': '', 'morph': ''})
        counts = module.node_counts(nodes)
        self.assertEqual([counts[k] for k in ('missingWordIds', 'missingLemma', 'missingMorphology')], [2, 2, 2])

    def test_unknown_reading_markup_is_rejected(self):
        for body in ('<choice>א</choice>', '<w mysterious="yes">א</w>', '<w type="guessed">א</w>',
                     '<note><w>א</w></note>', '<note type="new-reading">א</note>',
                     '<seg type="x-maqqef" subType="new">־</seg>', '<w xmlns="other">א</w>',
                     '<!-- discarded? --><w>א</w>', '<?reading changed?><w>א</w>'):
            with self.subTest(body=body), self.assertRaises(ValueError):
                module.parse_book(fixture(body), 'Gen', 'Genesis', 'test')

    def test_source_reference_is_not_english_remapped(self):
        book = module.parse_book(fixture('<w>א</w>', 'Joel', '4', '21'), 'Joel', 'Joel', 'test')
        self.assertEqual(book['chapters'][0]['verses'][0]['osisId'], 'Joel.4.21')
        bad = fixture('<w>א</w>').replace(b'Gen.1.1', b'Gen.2.1')
        with self.assertRaises(ValueError):
            module.parse_book(bad, 'Gen', 'Genesis', 'test')

    def test_duplicate_reference_and_outside_text_are_rejected(self):
        source = fixture('<w>א</w>')
        duplicate = source.replace(b'</verse>', b'</verse><verse osisID="Gen.1.1"><w>duplicate</w></verse>')
        for bad in (duplicate, source.replace(b'<osisText>', b'<osisText>lost text'),
                    source.replace(b'</verse>', b'</verse>lost text')):
            with self.assertRaises(ValueError):
                module.parse_book(bad, 'Gen', 'Genesis', 'test')

    def test_dtd_is_rejected(self):
        with self.assertRaises(ValueError):
            module.parse_book(b'<!DOCTYPE osis [<!ENTITY x "changed">]>' + fixture('<w>&x;</w>'), 'Gen', 'Genesis', 'test')

    def test_bad_archive_hash_is_rejected_before_parsing(self):
        pins = json.loads((ROOT / 'data/original-language/oshb/source.json').read_text())
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'bad.tar.gz'
            archive.write_bytes(b'not the pinned archive')
            with self.assertRaisesRegex(ValueError, 'Archive size/SHA-256'):
                module.read_sources(archive, pins)

    def test_traversal_is_rejected_even_when_archive_digest_matches(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as archive:
            member = tarfile.TarInfo('morphhb-test/../outside')
            member.size = 1
            archive.addfile(member, io.BytesIO(b'x'))
        data = stream.getvalue()
        pins = {'upstream': {'commit': 'test', 'archiveBytes': len(data), 'archiveSha256': hashlib.sha256(data).hexdigest()}, 'sourceFiles': []}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'unsafe.tar.gz'
            path.write_bytes(data)
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                module.read_sources(path, pins)


if __name__ == '__main__':
    unittest.main()
