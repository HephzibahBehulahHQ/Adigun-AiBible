"""Adversarial importer checks; synthetic rows are test fixtures, never corpus data."""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('greek_importer', ROOT / 'scripts/import-greek-source.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
DEST = ROOT / 'data/original-language/morphgnt-sblgnt'
GRAMMAR = json.loads((DEST / 'morphology.json').read_bytes())
ROW = '010101 N- ----NSF- Βίβλος Βίβλος βίβλος βίβλος\n'


def parse(value):
    return importer.parse_book(value.encode() if isinstance(value, str) else value, 1, 'Mt', 'Matthew')


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as target:
        for name, data, kind in entries:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.size = len(data) if kind == tarfile.REGTYPE else 0
            member.mode = 0o644
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                member.linkname = '../../outside'
            target.addfile(member, io.BytesIO(data) if kind == tarfile.REGTYPE else None)
    return output.getvalue()


class GreekImporterTests(unittest.TestCase):
    def test_exact_unicode_and_all_distinct_fields_roundtrip(self):
        # Deliberate decomposed alpha + combining marks: a normalization regression changes bytes.
        value = '010101 V- 3PAI-S-- ⸂α\u0313’⸃· α\u0313’ ἐστί(ν) εἰμί\n' + ROW
        book = parse(value)
        self.assertEqual(importer.roundtrip_book(book), value.encode())
        token = book['chapters'][0]['verses'][0]['tokens'][0]
        self.assertEqual(token['text'], '⸂α\u0313’⸃·')
        self.assertEqual(token['normalized'], 'ἐστί(ν)')
        self.assertEqual([t['ordinal'] for t in book['chapters'][0]['verses'][0]['tokens']], [1, 2])

    def test_source_gaps_are_preserved_not_padded(self):
        value = ROW + ROW.replace('010101', '010103') + ROW.replace('010101', '010412')
        book = parse(value)
        self.assertEqual([chapter['number'] for chapter in book['chapters']], ['1', '4'])
        self.assertEqual([verse['number'] for verse in book['chapters'][0]['verses']], ['1', '3'])
        self.assertEqual(importer.roundtrip_book(book), value.encode())

    def test_wrong_book_zero_or_reordered_reference_rejected(self):
        for ref in ['020101', '000101', '010001', '010100', '10101', '01010x']:
            with self.subTest(ref=ref), self.assertRaises(ValueError):
                parse(ROW.replace('010101', ref))
        with self.assertRaises(ValueError):
            parse(ROW.replace('010101', '010102') + ROW)

    def test_separators_extra_fields_and_control_characters_rejected(self):
        cases = [ROW.replace(' N-', '  N-'), ROW.replace(' N-', '\tN-'), ROW.replace(' N-', '\u00a0N-'),
                 ROW.replace(' βίβλος\n', '\n'), ROW.replace('\n', ' extra\n'), ROW + '\n',
                 ROW.replace('Βίβλος', 'Βίβ\x00λος', 1), ROW.replace('Βίβλος', 'Βίβ\x7fλος', 1)]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse(value)

    def test_literal_lf_utf8_and_line_bound_enforced(self):
        for value in [b'', ROW.rstrip('\n').encode(), ROW.replace('\n', '\r\n').encode(),
                      b'\xef\xbb\xbf' + ROW.encode(), ROW.encode().replace(b'N-', b'\xff-'),
                      ROW.replace('Βίβλος', 'x' * 4100, 1).encode()]:
            with self.subTest(size=len(value)), self.assertRaises((ValueError, UnicodeError)):
                parse(value)

    def test_unknown_symbols_are_retained_instead_of_guessed(self):
        book = parse(ROW.replace('N- ----NSF-', 'Q- 9ZQJVQZQ'))
        token = book['chapters'][0]['verses'][0]['tokens'][0]
        self.assertEqual(token['partOfSpeech'], 'Q-')
        self.assertEqual(token['parsing'], '9ZQJVQZQ')
        self.assertEqual(importer.unknown_symbols(token, GRAMMAR),
                         ['partOfSpeech:Q-', 'person:9', 'tense:Z', 'voice:Q', 'mood:J',
                          'case:V', 'number:Q', 'gender:Z', 'degree:Q'])
        self.assertEqual(importer.roundtrip_book(book), ROW.replace('N- ----NSF-', 'Q- 9ZQJVQZQ').encode())

    def test_dash_is_not_given_an_invented_description(self):
        token = parse(ROW.replace('N- ----NSF-', 'C- --------'))['chapters'][0]['verses'][0]['tokens'][0]
        self.assertEqual(importer.unknown_symbols(token, GRAMMAR), [])
        self.assertTrue(all('-' not in position['codes'] for position in GRAMMAR['positions']))
        self.assertNotIn('V', GRAMMAR['positions'][4]['codes'])

    def test_corrupt_code_shapes_rejected(self):
        for pos, code in [('NNN', '----NSF-'), ('N-', '----NSF'), ('N-', '----NSF--'), ('N-', '----NSFα')]:
            with self.subTest(pos=pos, code=code), self.assertRaises(ValueError):
                parse(ROW.replace('N- ----NSF-', pos + ' ' + code))

    def test_roundtrip_rejects_tampered_locator_and_order(self):
        for field in ['sourceLine', 'ordinal']:
            book = parse(ROW)
            book['chapters'][0]['verses'][0]['tokens'][0][field] = 2
            with self.assertRaises(ValueError):
                importer.roundtrip_book(book)

    def test_unsafe_duplicate_and_wrong_root_members_rejected(self):
        for path in ['../escape', '/absolute', 'root/../escape', 'other/file', 'root/./file', 'root/a\\b']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                importer.archive_members(archive([(path, b'x', tarfile.REGTYPE)]), 'root/')
        with self.assertRaises(ValueError):
            importer.archive_members(archive([('root/a', b'x', tarfile.REGTYPE)] * 2), 'root/')

    def test_links_special_files_and_path_collisions_rejected(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                importer.archive_members(archive([('root/a', b'', kind)]), 'root/')
        with self.assertRaises(ValueError):
            importer.archive_members(archive([('root/a', b'x', tarfile.REGTYPE), ('root/a/b', b'y', tarfile.REGTYPE)]), 'root/')

    def test_all_archive_bounds_enforced_before_admission(self):
        data = archive([('root/a', b'1234', tarfile.REGTYPE), ('root/b', b'5678', tarfile.REGTYPE)])
        for key, bound in [('MAX_ARCHIVE_BYTES', 1), ('MAX_MEMBER_BYTES', 3), ('MAX_EXPANDED_BYTES', 7), ('MAX_MEMBERS', 1)]:
            with self.subTest(bound=key), patch.object(importer, key, bound), self.assertRaises(ValueError):
                importer.archive_members(data, 'root/')

    def test_archive_hash_tree_and_selected_blob_are_independent_gates(self):
        data = archive([('root/a', b'abc', tarfile.REGTYPE)])
        upstream = {'archiveBytes': len(data), 'archiveSha256': importer.sha256(data), 'archivePrefix': 'root/',
                    'tree': importer.git_tree({'a': ('100644', b'abc')})}
        pin = {'path': 'a', 'bytes': 3, 'sha256': importer.sha256(b'abc'), 'gitBlobSha': importer.git_object('blob', b'abc').hex()}
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'source.tar.gz'; path.write_bytes(data)
            self.assertEqual(importer.read_archive(path, upstream, [pin]), {'a': b'abc'})
            for field in ['archiveSha256', 'tree']:
                with self.subTest(field=field), self.assertRaises(ValueError):
                    importer.read_archive(path, {**upstream, field: '0' * len(upstream[field])}, [pin])
            for field in ['sha256', 'gitBlobSha']:
                with self.subTest(field=field), self.assertRaises(ValueError):
                    importer.read_archive(path, upstream, [{**pin, field: '0' * len(pin[field])}])
            for selected in [[{**pin, 'path': 'missing'}], [pin, pin]]:
                with self.assertRaises(ValueError):
                    importer.read_archive(path, upstream, selected)

    def test_missing_license_declarations_block_build(self):
        pins = json.loads((DEST / 'source.json').read_bytes())
        sources = {'README.md': (DEST / 'notices/MorphGNT-README.md').read_bytes()}
        text = {'README.md': (DEST / 'notices/SBLGNT-README.md').read_bytes(), 'LICENSE': (DEST / 'notices/CC-BY-4.0.txt').read_bytes()}
        annotation = (DEST / 'notices/CC-BY-SA-3.0.txt').read_bytes()
        importer.verify_rights(sources, text, annotation, pins)
        for bad_sources, bad_text, bad_annotation in [
            ({'README.md': b'No annotation license'}, text, annotation),
            (sources, {**text, 'README.md': b'No text license'}, annotation),
            (sources, {**text, 'LICENSE': b'Unknown'}, annotation),
            (sources, text, annotation[:-1]),
        ]:
            with self.assertRaises(ValueError):
                importer.verify_rights(bad_sources, bad_text, bad_annotation, pins)

    def test_missing_source_key_section_is_not_silently_invented(self):
        readme = (DEST / 'notices/MorphGNT-README.md').read_bytes()
        with self.assertRaises((ValueError, IndexError)):
            importer.morphology_key(readme.replace(b' * case ', b' * altered '))


if __name__ == '__main__':
    unittest.main()
