"""Self-contained importer regressions; no network or raw-source cache required."""
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
IDS = ['fra-darby2024', 'spa-simple2026', 'tdx-tandroy', 'hausa2020', 'igbo2020']


def read(edition, path):
    return json.loads((ROOT / 'data/editions' / edition / path).read_text(encoding='utf-8'))


def verse(edition, record):
    book = read(edition, f'books/{record["bookId"]}.json')
    chapter = next(row for row in book['chapters'] if row['number'] == record['chapter'])
    return next(row['text'] for row in chapter['verses'] if row['number'] == record['verse'])


class NextEditionChecks(unittest.TestCase):
    def test_generated_text_hash_normalizes_git_line_endings_but_keeps_publisher_bytes_exact(self):
        canonical = IMPORTER.json_bytes({'text': 'cælum'})
        windows = canonical.replace(b'\n', b'\r\n')
        self.assertEqual(IMPORTER.canonical_generated_bytes('manifest.json', windows), canonical)
        self.assertEqual(IMPORTER.canonical_generated_bytes('NOTICE.txt', windows), canonical)
        self.assertEqual(IMPORTER.canonical_generated_bytes('SOURCE_NOTICE.html.txt', windows), canonical)
        self.assertTrue(IMPORTER.generated_hash_matches('SOURCE_NOTICE.html.txt', windows, IMPORTER.sha(windows)))
        self.assertTrue(IMPORTER.generated_hash_matches('SOURCE_NOTICE.html.txt', windows, IMPORTER.sha(canonical)))
        changed = windows.replace('cælum'.encode(), 'caelum'.encode())
        self.assertFalse(IMPORTER.generated_hash_matches('manifest.json', changed, IMPORTER.sha(canonical)))

    def test_complete_exception_inventories_reject_changed_counts_coordinates_and_offsets(self):
        for edition, count in zip(IDS, [4030, 0, 10, 0, 0]):
            with self.subTest(edition=edition):
                provenance = read(edition, 'provenance.json')
                brackets = provenance.get('publisherBracketFormatDifferences', [])
                boundaries = provenance.get('publisherXmlBoundaryNbspDifferences', [])
                self.assertEqual(len(brackets), count)
                IMPORTER.verify_vpl_format_inventory(edition, brackets + boundaries)
                changed = copy.deepcopy(brackets)
                if changed:
                    changed[0]['bracketPositions'][0]['offset'] += 1
                else:
                    changed.append({'bookId': 'GEN', 'chapter': 1, 'verse': 1})
                with self.assertRaisesRegex(ValueError, 'exception inventory changed'):
                    IMPORTER.verify_vpl_format_inventory(edition, changed + boundaries)
                if brackets:
                    with self.assertRaisesRegex(ValueError, 'exception inventory changed'):
                        IMPORTER.verify_vpl_format_inventory(edition, brackets[1:] + boundaries)
                    changed = copy.deepcopy(brackets)
                    changed[0]['verse'] += 1
                    with self.assertRaisesRegex(ValueError, 'exception inventory changed'):
                        IMPORTER.verify_vpl_format_inventory(edition, changed + boundaries)

    def test_actual_bracket_receipts_preserve_display_and_reject_other_character_changes(self):
        for edition in ['fra-darby2024', 'tdx-tandroy']:
            receipt = read(edition, 'provenance.json')['publisherBracketFormatDifferences'][0]
            text = verse(edition, receipt)
            coordinate = {key: receipt[key] for key in ['bookId', 'chapter', 'verse']}
            right = {**coordinate, 'editionId': edition, 'text': text}
            left = {**right, 'text': text.replace('[', '').replace(']', '')}
            unchanged = copy.deepcopy(right)
            self.assertEqual(IMPORTER.vpl_format_difference(edition, left, right), receipt)
            self.assertEqual(right, unchanged)
            for altered in [left['text'] + ' ', left['text'].replace(' ', '\u00a0', 1), left['text'] + '\u0301']:
                with self.subTest(edition=edition, altered=altered):
                    with self.assertRaises(ValueError):
                        IMPORTER.vpl_format_difference(edition, {**left, 'text': altered}, right)
        # The Spanish source has no bracket exception permission.
        row = {'bookId': 'GEN', 'chapter': 1, 'verse': 1, 'editionId': 'spa-simple2026'}
        with self.assertRaises(ValueError):
            IMPORTER.vpl_format_difference('spa-simple2026', {**row, 'text': 'TEST source'}, {**row, 'text': '[TEST] source'})

    def test_all_seven_tandroy_boundaries_are_exact_not_general_unicode_trimming(self):
        edition = 'tdx-tandroy'
        provenance = read(edition, 'provenance.json')
        boundaries = provenance['publisherXmlBoundaryNbspDifferences']
        self.assertEqual(len(boundaries), 7)
        self.assertEqual(IMPORTER.sha(IMPORTER.json_bytes(boundaries)), 'c8154b8a647450fafbd45bbb6a9c8edfc3309b38ec46f124fec54c1681255a98')
        evidence = read(edition, 'FORMAT_EVIDENCE.json')
        self.assertEqual(evidence['usfmArchive']['sha256'], 'ea4ce058200b73719aa62e989b371f19537cb6904c73b3aee66d83aac99b35b6')
        for receipt in boundaries:
            with self.subTest(reference=receipt):
                text = verse(edition, receipt)
                coordinate = {key: receipt[key] for key in ['bookId', 'chapter', 'verse']}
                right = {**coordinate, 'editionId': edition, 'text': text}
                left = {**right, 'text': text + '\u00a0'}
                unchanged = copy.deepcopy(right)
                self.assertEqual(IMPORTER.vpl_format_difference(edition, left, right), receipt)
                self.assertEqual(right, unchanged)
                independent = next(row for row in evidence['records'] if all(row[key] == coordinate[key] for key in coordinate))
                self.assertEqual(IMPORTER.sha(independent['usfmExcerpt'].encode()), independent['excerptSha256'])
                self.assertIn('\u00a0\\f ', independent['usfmExcerpt'])
                self.assertEqual(independent['textSha256'], IMPORTER.sha(text.encode()))
                self.assertEqual(independent['xmlTextSha256'], IMPORTER.sha(left['text'].encode()))
                self.assertEqual(independent['xmlNbspOffset'], len(text))
                mutations = [
                    ({**left, 'text': text + '\u2003'}, right),
                    ({**left, 'text': text + '\u00a0\u00a0'}, right),
                    ({**left, 'text': '\u00a0' + text}, right),
                    ({**left, 'text': text + ' \u00a0'}, {**right, 'text': text + ' '}),
                    ({**left, 'bookId': 'GEN', 'chapter': 1, 'verse': 1}, {**right, 'bookId': 'GEN', 'chapter': 1, 'verse': 1}),
                ]
                for changed_left, changed_right in mutations:
                    with self.assertRaises(ValueError):
                        IMPORTER.vpl_format_difference(edition, changed_left, changed_right)
                with self.assertRaises(ValueError):
                    IMPORTER.vpl_format_difference('fra-darby2024', left, right)
        for changed in [boundaries[:-1], boundaries + [boundaries[0]]]:
            with self.assertRaisesRegex(ValueError, 'exception inventory changed'):
                IMPORTER.verify_vpl_format_inventory(edition, provenance['publisherBracketFormatDifferences'] + changed)
        changed = copy.deepcopy(boundaries)
        changed[0]['publisherXmlBoundaryNbsp']['offset'] += 1
        with self.assertRaisesRegex(ValueError, 'exception inventory changed'):
            IMPORTER.verify_vpl_format_inventory(edition, provenance['publisherBracketFormatDifferences'] + changed)

    def test_changed_archives_and_each_member_fail_before_admission_without_downloads(self):
        with tempfile.TemporaryDirectory(prefix='next-edition-pins-') as folder:
            directory = Path(folder)
            with patch.object(IMPORTER.urllib.request, 'urlopen', side_effect=AssertionError('No source download is allowed in this test')):
                for edition in IDS:
                    with self.subTest(edition=edition):
                        (directory / (edition + '.zip')).write_bytes(b'TEST changed source archive')
                        with self.assertRaisesRegex(ValueError, 'archive checksum mismatch'):
                            IMPORTER.archive_bytes(edition, directory)
                        source = IMPORTER.SOURCES[edition]
                        raw = io.BytesIO()
                        with zipfile.ZipFile(raw, 'w') as archive:
                            for suffix in ['vpl.xml', 'vpl.txt', 'about.htm']:
                                archive.writestr(source['providerId'] + '_' + suffix, b'TEST changed member')
                        with zipfile.ZipFile(io.BytesIO(raw.getvalue())) as archive:
                            for suffix, key in [('vpl.xml', 'xmlSha256'), ('vpl.txt', 'textSha256'), ('about.htm', 'noticeSha256')]:
                                with self.assertRaisesRegex(ValueError, 'member checksum mismatch'):
                                    IMPORTER.member(archive, source['providerId'] + '_' + suffix, source[key])

    def test_importer_keeps_notice_bytes_combining_marks_and_terminal_nbsp(self):
        # Deliberately minimal synthetic archive; never a production edition.
        edition = 'spa-simple2026'
        source = copy.deepcopy(IMPORTER.SOURCES[edition])
        text = 'TEST e\u0301 — א source\u00a0'
        xml = f'<verseFile><v b="GEN" c="1" v="1">{text}</v></verseFile>'.encode()
        plain = f'GEN 1:1 {text}\n'.encode()
        notice = b'<p>TEST fixture notice: preserve CRLF and <a href="https://example.invalid/rights">rights</a>.</p>\r\n'
        source.update(expectedTotals={'books': 1, 'chapters': 1, 'verses': 1}, xmlSha256=IMPORTER.sha(xml),
                      textSha256=IMPORTER.sha(plain), noticeSha256=IMPORTER.sha(notice))
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, 'w') as archive:
            for suffix, content in [('vpl.xml', xml), ('vpl.txt', plain), ('about.htm', notice)]:
                archive.writestr(source['providerId'] + '_' + suffix, content)
        with patch.dict(IMPORTER.SOURCES, {edition: source}), patch.object(IMPORTER, 'BOOKS', [('GEN', 'Genesis')]):
            output = IMPORTER.build_artifacts(edition, raw.getvalue())
        self.assertEqual(output['SOURCE_NOTICE.html.txt'], notice)
        self.assertEqual(json.loads(output['books/GEN.json'])['chapters'][0]['verses'][0]['text'], text)
        self.assertEqual(json.loads(output['search-index.json'])[0]['text'], text)

    def test_onbv_pins_combined_verse_ranges_and_keeps_the_publisher_txt_bracket(self):
        edition = 'spaonbv'
        source = IMPORTER.SOURCES[edition]
        provenance = read(edition, 'provenance.json')
        ranges = provenance['publisherSourceVerseRanges']
        self.assertEqual(len(ranges), source['sourceVerseRangeCount'])
        self.assertEqual(IMPORTER.sha(IMPORTER.json_bytes(ranges)), source['sourceVerseRangesSha256'])
        self.assertEqual(IMPORTER.sha(IMPORTER.json_bytes(ranges)), 'd805624ce12efdc073565a7efc5795cce9db474b85b6d1272558c06c4799531f')
        differences = provenance['publisherBracketFormatDifferences']
        self.assertEqual(len(differences), 1)
        self.assertEqual(differences[0]['bookId'], 'NUM')
        self.assertEqual((differences[0]['chapter'], differences[0]['verse']), (2, 3))
        self.assertEqual(IMPORTER.sha(IMPORTER.json_bytes(differences)), source['bracketExceptionInventorySha256'])
        displayed = verse(edition, differences[0])
        self.assertIn('[o Deuel]', displayed)
        self.assertEqual(read(edition, 'provenance.json')['totals']['verses'], 29102)


if __name__ == '__main__':
    unittest.main()
