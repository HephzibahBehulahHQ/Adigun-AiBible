#!/usr/bin/env python3
"""Import pinned publisher Bible/Quran editions without rewriting source wording.

Raw archives are kept outside the repository. Imports fail on changed/truncated
downloads, unexpected markup, duplicate references, or XML/plain-text disagreement.
"""
from __future__ import annotations

import argparse
from collections import OrderedDict
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'data' / 'editions'
OBSERVED_ON = '2026-11-03'
MAX_ARCHIVE_BYTES = 20_000_000
MAX_MEMBER_BYTES = 20_000_000
ASCII_PADDING = ' \t\r\n'
BOOKS = [
    ('GEN', 'Genesis'), ('EXO', 'Exodus'), ('LEV', 'Leviticus'), ('NUM', 'Numbers'), ('DEU', 'Deuteronomy'),
    ('JOS', 'Joshua'), ('JDG', 'Judges'), ('RUT', 'Ruth'), ('1SA', '1 Samuel'), ('2SA', '2 Samuel'),
    ('1KI', '1 Kings'), ('2KI', '2 Kings'), ('1CH', '1 Chronicles'), ('2CH', '2 Chronicles'), ('EZR', 'Ezra'),
    ('NEH', 'Nehemiah'), ('EST', 'Esther'), ('JOB', 'Job'), ('PSA', 'Psalms'), ('PRO', 'Proverbs'),
    ('ECC', 'Ecclesiastes'), ('SNG', 'Song of Solomon'), ('ISA', 'Isaiah'), ('JER', 'Jeremiah'), ('LAM', 'Lamentations'),
    ('EZK', 'Ezekiel'), ('DAN', 'Daniel'), ('HOS', 'Hosea'), ('JOL', 'Joel'), ('AMO', 'Amos'),
    ('OBA', 'Obadiah'), ('JON', 'Jonah'), ('MIC', 'Micah'), ('NAM', 'Nahum'), ('HAB', 'Habakkuk'),
    ('ZEP', 'Zephaniah'), ('HAG', 'Haggai'), ('ZEC', 'Zechariah'), ('MAL', 'Malachi'), ('MAT', 'Matthew'),
    ('MRK', 'Mark'), ('LUK', 'Luke'), ('JHN', 'John'), ('ACT', 'Acts'), ('ROM', 'Romans'),
    ('1CO', '1 Corinthians'), ('2CO', '2 Corinthians'), ('GAL', 'Galatians'), ('EPH', 'Ephesians'), ('PHP', 'Philippians'),
    ('COL', 'Colossians'), ('1TH', '1 Thessalonians'), ('2TH', '2 Thessalonians'), ('1TI', '1 Timothy'), ('2TI', '2 Timothy'),
    ('TIT', 'Titus'), ('PHM', 'Philemon'), ('HEB', 'Hebrews'), ('JAS', 'James'), ('1PE', '1 Peter'),
    ('2PE', '2 Peter'), ('1JN', '1 John'), ('2JN', '2 John'), ('3JN', '3 John'), ('JUD', 'Jude'), ('REV', 'Revelation'),
]
TEXT_IDS = {'SOL': 'SNG', 'EZE': 'EZK', 'JOE': 'JOL', 'NAH': 'NAM', 'MAR': 'MRK', 'JOH': 'JHN',
            'PHI': 'PHP', 'JAM': 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN'}
SOURCES = {
    'deu1912': {
        'name': 'Lutherbibel 1912', 'language': 'de', 'corpus': 'bible', 'publisher': 'eBible.org',
        'translator': 'Martin Luther; 1912 revision', 'sourceUpdatedAt': '2025-12-29',
        'sourceUrl': 'https://ebible.org/deu1912/',
        'formatUrl': 'https://ebible.org/find/details.php?id=deu1912',
        'downloadUrl': 'https://ebible.org/Scriptures/deu1912_vpl.zip',
        'licenseUrl': 'https://ebible.org/deu1912/copyright.htm', 'license': 'Public domain',
        'licenseIdentifier': 'LicenseRef-Public-Domain',
        'attribution': 'Lutherbibel 1912. Martin Luther; 1912 revision. Public domain. Source: eBible.org.',
        'sha256': 'af668fb39d9c96ceddc3af69cb22db809770d09e7999012aacdaedf85eb5de16',
        'xmlSha256': 'aef32e66031a8e9c08aed65a8100bd4e877640b1352a7416c4c6647118230a11',
        'textSha256': 'f6723776717b2e18e53dc81b0b7758aeb6ce969aee9cfb432d9b61006fa13dff',
        'noticeSha256': '9e86f38ca04836ef1540ecb9d8d5dac565ce7e86ce62813e3621d094a0ca6767',
        'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
        'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
        'conditions': ['Retain accurate edition/source identity.', 'Public-domain status applies to this 1912 text, not modern Luther revisions.'],
    },
    'yor': {
        'name': 'Biblica® Open Yoruba Contemporary Bible™', 'language': 'yo', 'corpus': 'bible',
        'publisher': 'Biblica, Inc.; distributed by eBible.org', 'translator': 'Biblica, Inc.',
        'sourceUpdatedAt': '2025-06-25', 'sourceUrl': 'https://ebible.org/yor/',
        'formatUrl': 'https://ebible.org/find/details.php?id=yor',
        'downloadUrl': 'https://ebible.org/Scriptures/yor_vpl.zip',
        'licenseUrl': 'https://ebible.org/yor/copyright.htm', 'license': 'CC BY-SA 4.0',
        'licenseIdentifier': 'CC-BY-SA-4.0', 'licenseDeedUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'attribution': 'Biblica® Open Yoruba Contemporary Bible™. Copyright © 2009, 2017 by Biblica, Inc. CC BY-SA 4.0. Unmodified source text; full notice accompanies this edition.',
        'sha256': 'afa5abe34101cd7ce7a49f7c45d8d34449721a3eafe8f20dd7a1acee543ed00b',
        'xmlSha256': '60295776c127ff4219058735feb2cf6842b570ed665e1df7fe7fe77cce1b3274',
        'textSha256': '1b1392a2eb8db604dd73f222e3b9e50937c3f9b38fa221a442c08bb6034d5dff',
        'noticeSha256': '734878c78418c57309c9d88f2751bae051a4f8a0a0adc043415697c5ad874c9a',
        'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31087},
        'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
        'conditions': [
            'Include the complete publisher copyright/source notice and CC BY-SA 4.0 license.',
            'Keep Biblica trademarks intact for unchanged copies; do not imply publisher endorsement.',
            'For derivatives, remove the Biblica trademark, disclose changes, apply the prescribed attribution, and use CC BY-SA 4.0.',
            'This text license does not grant unrelated photographs, maps, or third-party recorded audio rights.',
        ],
    },
    'eng-clearquran': {
        'name': 'ClearQuran — Allah Edition', 'language': 'en', 'corpus': 'quran',
        'publisher': 'ClearQuran', 'translator': 'Talal Itani', 'sourceUpdatedAt': '2026-10-09',
        'sourceUrl': 'https://clearquran.com/', 'formatUrl': 'https://clearquran.com/download/',
        'downloadUrl': 'https://d.clearquran.com/text/clearquran-txt-allah-edition.zip',
        'licenseUrl': 'https://clearquran.com/download/', 'license': 'CC BY-ND 4.0 with publisher formatting permissions',
        'licenseIdentifier': 'CC-BY-ND-4.0', 'licenseDeedUrl': 'https://creativecommons.org/licenses/by-nd/4.0/',
        'attribution': 'Translation by Talal Itani, ClearQuran.com (Allah Edition). CC BY-ND 4.0. Wording unchanged.',
        'sha256': '3ca939fee6186ce06db165df29dfa2b8e66179c198f41c4924bc2e15be725876',
        'textSha256': '138b00041d6013f2dd96e84038529044da53748e8c534942af37edd2a4ca3eb5',
        'expectedTotals': {'surahs': 114, 'verses': 6236},
        'rights': {'redistribute': True, 'adapt': False, 'offline': True, 'audio': True, 'export': True},
        'conditions': [
            'Credit Translation by Talal Itani, ClearQuran.com and include the license; link to https://clearquran.com where possible.',
            'Commercial use, storage, format conversion, selecting exact verses, and combining unchanged quotations with other content are expressly permitted.',
            'Do not change, add, or remove translation words; semantic paraphrase/adaptation is not licensed.',
            'The publisher download-page terms supersede old noncommercial readme notices; this pinned archive already states CC BY-ND 4.0.',
            'Only text is imported here; no recorded audio files are included.',
        ],
    },
    'eng-bsb': {
        'name': 'Berean Standard Bible', 'abbreviation': 'BSB', 'language': 'en', 'corpus': 'bible',
        'publisher': 'BSB Publishing, LLC', 'translator': 'Berean Bible Translation Committee',
        'revision': 'Publisher USJ release v5.19', 'canon': 'protestant-66',
        'sourceUpdatedAt': '2026-10-27', 'rightsObservedAt': '2026-11-04',
        'sourceUrl': 'https://berean.bible/',
        'formatUrl': 'https://github.com/BSB-publishing/bsb2usfm/releases/tag/v5.19',
        'downloadUrl': 'https://github.com/BSB-publishing/bsb2usfm/releases/download/v5.19/BSB_usj.zip',
        'licenseUrl': 'https://berean.bible/terms.htm', 'license': 'Public domain',
        'licenseIdentifier': 'LicenseRef-Public-Domain',
        'attribution': 'Berean Standard Bible (BSB). BSB Publishing, LLC; Berean Bible Translation Committee. Publisher USJ release v5.19, 27 October 2026. Public domain. https://berean.bible/',
        'sha256': '783aced3c3c8a2b145e4f8c48e3b94a5a5515e050719bb8621d094be78a5269f',
        'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31086},
        'format': 'usj-3.0',
        'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
        'conditions': ['Keep exact BSB wording and source identity when identifying a quotation as BSB.',
                       'The publisher asks that altered derivatives use a separate name.',
                       'No third-party recorded audio is included or licensed by this text import.'],
    },
    'eng-asv': {
        'name': 'American Standard Version (1901)', 'abbreviation': 'ASV', 'language': 'en', 'corpus': 'bible',
        'publisher': 'eBible.org', 'translator': 'American Revision Committee',
        'revision': '1901; eBible source dated 2026-10-30', 'canon': 'protestant-66',
        'sourceUpdatedAt': '2026-10-30', 'rightsObservedAt': '2026-11-04',
        'sourceUrl': 'https://ebible.org/eng-asv/',
        'formatUrl': 'https://ebible.org/find/details.php?id=eng-asv',
        'downloadUrl': 'https://ebible.org/Scriptures/eng-asv_vpl.zip',
        'licenseUrl': 'https://ebible.org/eng-asv/copyright.htm', 'license': 'Public domain',
        'licenseIdentifier': 'LicenseRef-Public-Domain',
        'attribution': 'American Standard Version (1901). Public domain. Source: eBible.org, source dated 30 October 2026.',
        'sha256': '6c41b8020cba9cf7041689f2356c55859e28023405537388be08bad93df2b050',
        'xmlSha256': 'c1f2847ae9856ea062f675103f8931b6338949ba8ec673e9234140d5b60f6ce8',
        'textSha256': '8924ef74086d572425b1e335f531c7c529a561969e5c851e456b84c2ce6ad858',
        'noticeSha256': 'e39b826d64a43d79370e571aa74e01e6c40ed86537d2fd0cbf8a326d80dd7e86',
        'bracketExceptionCount': 3748,
        'bracketExceptionInventorySha256': 'd17944163b21e9910e36336df2e49f0c66e307a2b6a2fd961beb681ec2551bad',
        'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
        'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
        'conditions': ['Preserve this 1901 edition identity and the pinned publisher source.',
                       'The VPL source supplies scripture text without headings, footnotes or paragraph styles; no source annotation coverage is claimed.',
                       'No third-party recorded audio is included or licensed by this text import.'],
    },
}

# Individually inspected historical sources; provider IDs are distinct from app IDs.
SOURCES.update({'eng-ylt': {'name': "Young's Literal Translation",
             'abbreviation': 'YLT',
             'language': 'en',
             'corpus': 'bible',
             'publisher': 'eBible.org',
             'translator': 'Robert Young',
             'providerId': 'engylt',
             'revision': '1862/1898; provider identifies the 1898 edition',
             'canon': 'protestant-66',
             'sourceUpdatedAt': '2025-12-12',
             'rightsObservedAt': '2026-11-05',
             'sourceUrl': 'https://ebible.org/engylt/',
             'formatUrl': 'https://ebible.org/find/details.php?id=engylt',
             'downloadUrl': 'https://ebible.org/Scriptures/engylt_vpl.zip',
             'downloadBytes': 4318747,
             'licenseUrl': 'https://ebible.org/engylt/copyright.htm',
             'license': 'Public domain (provider-declared)',
             'licenseIdentifier': 'LicenseRef-Public-Domain',
             'attribution': "Young's Literal Translation. Robert Young. 1862/1898; provider identifies the 1898 "
                            'edition. Public domain as declared by eBible.org; source dated 2025-12-12.',
             'sha256': '653e9f1d8487de46e11574165a6355d3135ae378fb2198ee4128dedc06c8ca56',
             'xmlSha256': 'e98086cd743baf2d1b17fe10b4b644d55a19b9d4326a74ae599e1bb38d5541bf',
             'textSha256': '627d7af1a95d267a8f31f45b279b81385edaa646027a865a2939f0878d1b8533',
             'noticeSha256': '63f01c0cce0e187972a20c45dca85f6892b5a574400c17419a0fb5fe4fc73d31',
             'bracketExceptionCount': 8233,
             'bracketExceptionInventorySha256': '1bda1fe354e9548eac03149b0160ddc0914179f5464a526592f50a76884fa711',
             'bracketExceptionScope': '8233 source records differ only in the recorded square-bracket positions. '
                                      'Display text preserves the complete original TXT, including any brackets '
                                      'crossing verse boundaries; no source text is repaired or renumbered.',
             'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
             'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
             'conditions': ['Keep the exact historical edition, provider source and complete notice with '
                            'redistributed/offline copies.',
                            'The individual edition notice and provider policies declare this text public domain; this '
                            'is provider evidence, not an independent worldwide legal opinion.',
                            'The VPL source contains scripture text only; notes, introductions, headings and paragraph '
                            'layout are not included.',
                            'Changed study material must be separately labeled and must not be presented as unchanged '
                            'publisher text.',
                            'No third-party recorded audio, illustrations, maps or modern revisions are included or '
                            'licensed by this text import.'],
             'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm']},
 'eng-dby': {'name': 'Darby Translation',
             'abbreviation': 'DBY',
             'language': 'en',
             'corpus': 'bible',
             'publisher': 'eBible.org',
             'translator': 'J. N. Darby',
             'providerId': 'engDBY',
             'revision': 'Provider inventory: 1871/1884; eBible Darby source',
             'canon': 'protestant-66',
             'sourceUpdatedAt': '2019-11-16',
             'rightsObservedAt': '2026-11-05',
             'sourceUrl': 'https://ebible.org/engDBY/',
             'formatUrl': 'https://ebible.org/find/details.php?id=engDBY',
             'downloadUrl': 'https://ebible.org/Scriptures/engDBY_vpl.zip',
             'downloadBytes': 4316919,
             'licenseUrl': 'https://ebible.org/engDBY/copyright.htm',
             'license': 'Public domain (provider-declared)',
             'licenseIdentifier': 'LicenseRef-Public-Domain',
             'attribution': 'Darby Translation. J. N. Darby. Provider inventory: 1871/1884; eBible Darby source. '
                            'Public domain as declared by eBible.org; source dated 2019-11-16.',
             'sha256': '7eb1df2a434f5bbd831591aa96c08e94b900b1458fda74ccf1d1739d5af73619',
             'xmlSha256': 'b8bd5808e1b252fa0a2ff3e94d5b6b5832b4f0cfae460cf3bfbcfa5e4c1f6109',
             'textSha256': 'd32881ff23f4ec80b643085b3dd60e908b74220d432578a06038aac6d6060f6f',
             'noticeSha256': 'ec532372bd2b9a98d67db72e0793fe1556daa2b8e641de9ba9cc95d06eecccec',
             'bracketExceptionCount': 6052,
             'bracketExceptionInventorySha256': '50ab698b71e2c427577fa9d4f381bd8e5170fdb15a29b59427e6cdf064c93fb6',
             'bracketExceptionScope': '6052 source records differ only in the recorded square-bracket positions. '
                                      'Display text preserves the complete original TXT, including any brackets '
                                      'crossing verse boundaries; no source text is repaired or renumbered.',
             'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31099},
             'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
             'conditions': ['Keep the exact historical edition, provider source and complete notice with '
                            'redistributed/offline copies.',
                            'The individual edition notice and provider policies declare this text public domain; this '
                            'is provider evidence, not an independent worldwide legal opinion.',
                            'The VPL source contains scripture text only; notes, introductions, headings and paragraph '
                            'layout are not included.',
                            'Changed study material must be separately labeled and must not be presented as unchanged '
                            'publisher text.',
                            'No third-party recorded audio, illustrations, maps or modern revisions are included or '
                            'licensed by this text import.'],
             'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm']},
 'eng-webster': {'name': 'Noah Webster Bible (1833)',
                 'abbreviation': 'WBT',
                 'language': 'en',
                 'corpus': 'bible',
                 'publisher': 'eBible.org',
                 'translator': 'Noah Webster',
                 'providerId': 'engwebster',
                 'revision': '1833',
                 'canon': 'protestant-66',
                 'sourceUpdatedAt': '2025-12-12',
                 'rightsObservedAt': '2026-11-05',
                 'sourceUrl': 'https://ebible.org/engwebster/',
                 'formatUrl': 'https://ebible.org/find/details.php?id=engwebster',
                 'downloadUrl': 'https://ebible.org/Scriptures/engwebster_vpl.zip',
                 'downloadBytes': 4342864,
                 'licenseUrl': 'https://ebible.org/engwebster/copyright.htm',
                 'license': 'Public domain (provider-declared)',
                 'licenseIdentifier': 'LicenseRef-Public-Domain',
                 'attribution': 'Noah Webster Bible (1833). Noah Webster. 1833. Public domain as declared by '
                                'eBible.org; source dated 2025-12-12.',
                 'sha256': '402240da209b017c67a31b63773b42471ef7e2513aa76ef067f34af907537270',
                 'xmlSha256': 'e1772e039327f99e21d9b949d06a95817e0408d467f9a209e29199f0c4bbef00',
                 'textSha256': '989105cb7c414bae663f1198094455b6d5968f27ac03924c30542cafda11ce9b',
                 'noticeSha256': 'eb6b63b49cf6b0a590779ed30199ad67af394c3dd657fd92190a482d3d31298e',
                 'bracketExceptionCount': 14115,
                 'bracketExceptionInventorySha256': '865b08178850e9a47f0682b2e59b914dceca775d64f62bc8fd47377fd3b24261',
                 'bracketExceptionScope': '14115 source records differ only in the recorded square-bracket positions. '
                                          'Display text preserves the complete original TXT, including any brackets '
                                          'crossing verse boundaries; no source text is repaired or renumbered.',
                 'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
                 'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
                 'conditions': ['Keep the exact historical edition, provider source and complete notice with '
                                'redistributed/offline copies.',
                                'The individual edition notice and provider policies declare this text public domain; '
                                'this is provider evidence, not an independent worldwide legal opinion.',
                                'The VPL source contains scripture text only; notes, introductions, headings and '
                                'paragraph layout are not included.',
                                'Changed study material must be separately labeled and must not be presented as '
                                'unchanged publisher text.',
                                'No third-party recorded audio, illustrations, maps or modern revisions are included '
                                'or licensed by this text import.'],
                 'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm']},
 'fra-lsg1910': {'name': 'Louis Segond 1910',
                 'abbreviation': 'LSG',
                 'language': 'fr',
                 'corpus': 'bible',
                 'publisher': 'eBible.org',
                 'translator': 'Louis Segond',
                 'providerId': 'fraLSG',
                 'revision': '1910',
                 'canon': 'protestant-66',
                 'sourceUpdatedAt': '2026-10-30',
                 'rightsObservedAt': '2026-11-05',
                 'sourceUrl': 'https://ebible.org/fraLSG/',
                 'formatUrl': 'https://ebible.org/find/details.php?id=fraLSG',
                 'downloadUrl': 'https://ebible.org/Scriptures/fraLSG_vpl.zip',
                 'downloadBytes': 4592359,
                 'licenseUrl': 'https://ebible.org/fraLSG/copyright.htm',
                 'license': 'Public domain (provider-declared)',
                 'licenseIdentifier': 'LicenseRef-Public-Domain',
                 'attribution': 'Louis Segond 1910. Louis Segond. 1910. Public domain as declared by eBible.org; '
                                'source dated 2026-10-30.',
                 'sha256': 'fcdeac5aa1ebf857835a41bfa11f8fe5685c31ea602418a2998d4c870488f54b',
                 'xmlSha256': '7bb5841c5be36826bdbca6a1a87b61043f56a359de584948aeedca2cd83e30ed',
                 'textSha256': 'cfb948d3349cc4cc6e81c40d6e2fca7e09b9b8cf697864103e63a455880a1ea1',
                 'noticeSha256': '33a599306291352bcc257296c101d36cb3d92980665333f0b82861619b65408a',
                 'bracketExceptionCount': 2,
                 'bracketExceptionInventorySha256': '72e676298e5970c27c84f469859ef74b487e09be3f98981c7455cb8b7df4d7d8',
                 'bracketExceptionScope': '2 source records differ only in the recorded square-bracket positions. '
                                          'Display text preserves the complete original TXT, including any brackets '
                                          'crossing verse boundaries; no source text is repaired or renumbered.',
                 'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31170},
                 'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
                 'conditions': ['Keep the exact historical edition, provider source and complete notice with '
                                'redistributed/offline copies.',
                                'The individual edition notice and provider policies declare this text public domain; '
                                'this is provider evidence, not an independent worldwide legal opinion.',
                                'The VPL source contains scripture text only; notes, introductions, headings and '
                                'paragraph layout are not included.',
                                'Changed study material must be separately labeled and must not be presented as '
                                'unchanged publisher text.',
                                'No third-party recorded audio, illustrations, maps or modern revisions are included '
                                'or licensed by this text import.'],
                 'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm']},
 'spa-rv1909': {'name': 'Santa Biblia — Reina Valera 1909',
                'abbreviation': 'RV1909',
                'language': 'es',
                'corpus': 'bible',
                'publisher': 'eBible.org',
                'translator': 'Reina y Valera',
                'providerId': 'spaRV1909',
                'revision': '1909',
                'canon': 'protestant-66',
                'sourceUpdatedAt': '2015-08-10',
                'rightsObservedAt': '2026-11-05',
                'sourceUrl': 'https://ebible.org/spaRV1909/',
                'formatUrl': 'https://ebible.org/find/details.php?id=spaRV1909',
                'downloadUrl': 'https://ebible.org/Scriptures/spaRV1909_vpl.zip',
                'downloadBytes': 4403456,
                'licenseUrl': 'https://ebible.org/spaRV1909/copyright.htm',
                'license': 'Public domain (provider-declared)',
                'licenseIdentifier': 'LicenseRef-Public-Domain',
                'attribution': 'Santa Biblia — Reina Valera 1909. Reina y Valera. 1909. Public domain as declared by '
                               'eBible.org; source dated 2015-08-10.',
                'sha256': 'f0b20b2473b3ed30dcee584b2311b6a1db27b32e714f1a2b0e97d01ba179f284',
                'xmlSha256': '6e62b5d521fb67d71fc8478e50f2c5707e9086e40d847768eff0a483760adc24',
                'textSha256': '9d7aff52765d9e67b5d11ff667b6953319af39454ea32c53d6743401720594aa',
                'noticeSha256': '7151214d8a62e6b14a9d0a460427dd99672da3f0cd1ad92e1d16e20f9a35da36',
                'bracketExceptionCount': 3080,
                'bracketExceptionInventorySha256': 'f111f1dc00b23e85ce2aa59a9e0dc8ab7a76727cb0921a3925ecc2b0cc2897ae',
                'bracketExceptionScope': '3080 source records differ only in the recorded square-bracket positions. '
                                         'Display text preserves the complete original TXT, including any brackets '
                                         'crossing verse boundaries; no source text is repaired or renumbered.',
                'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
                'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
                'conditions': ['Keep the exact historical edition, provider source and complete notice with '
                               'redistributed/offline copies.',
                               'The individual edition notice and provider policies declare this text public domain; '
                               'this is provider evidence, not an independent worldwide legal opinion.',
                               'The VPL source contains scripture text only; notes, introductions, headings and '
                               'paragraph layout are not included.',
                               'Changed study material must be separately labeled and must not be presented as '
                               'unchanged publisher text.',
                               'No third-party recorded audio, illustrations, maps or modern revisions are included or '
                               'licensed by this text import.'],
                'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm']},
 'deu-elberfelder1905': {'name': 'Unrevidierte Elberfelder 1905',
                         'abbreviation': 'ELB1905',
                         'language': 'de',
                         'corpus': 'bible',
                         'publisher': 'eBible.org',
                         'translator': 'Julius Anton von Poseck, Carl Brockhaus, and John Nelson Darby',
                         'providerId': 'deuelo',
                         'revision': 'Unrevised 1905 edition',
                         'canon': 'protestant-66',
                         'sourceUpdatedAt': '2025-12-12',
                         'rightsObservedAt': '2026-11-05',
                         'sourceUrl': 'https://ebible.org/deuelo/',
                         'formatUrl': 'https://ebible.org/find/details.php?id=deuelo',
                         'downloadUrl': 'https://ebible.org/Scriptures/deuelo_vpl.zip',
                         'downloadBytes': 4689332,
                         'licenseUrl': 'https://ebible.org/deuelo/copyright.htm',
                         'license': 'Public domain (provider-declared)',
                         'licenseIdentifier': 'LicenseRef-Public-Domain',
                         'attribution': 'Unrevidierte Elberfelder 1905. Julius Anton von Poseck, Carl Brockhaus, and '
                                        'John Nelson Darby. Unrevised 1905 edition. Public domain as declared by '
                                        'eBible.org; source dated 2025-12-12.',
                         'sha256': '71a08dafdd8accb36a09fe757ab111a29b18cd25ade4b89013b542dc01d44b6a',
                         'xmlSha256': '7f5cc5001c9674f925281660730c7fe1b2869fb4558cb4aa0346203180c9347e',
                         'textSha256': 'a9cd10022e49e80ced94f60e8b781e383cce4a80cff595b95531622804b3e826',
                         'noticeSha256': '85082e0e38eaa139341bafed3c4ebf63e7bb40332eb2c3199b213b855925c754',
                         'bracketExceptionCount': 312,
                         'bracketExceptionInventorySha256': '9fd042a7c4b1f5a6a90d1e155b4466fb58c7c22db085afcb273db990088b8b10',
                         'bracketExceptionScope': '312 source records differ only in the recorded square-bracket '
                                                  'positions. Display text preserves the complete original TXT, '
                                                  'including any brackets crossing verse boundaries; no source text is '
                                                  'repaired or renumbered.',
                         'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
                         'rights': {'redistribute': True,
                                    'adapt': True,
                                    'offline': True,
                                    'audio': True,
                                    'export': True},
                         'conditions': ['Keep the exact historical edition, provider source and complete notice with '
                                        'redistributed/offline copies.',
                                        'The individual edition notice and provider policies declare this text public '
                                        'domain; this is provider evidence, not an independent worldwide legal '
                                        'opinion.',
                                        'The VPL source contains scripture text only; notes, introductions, headings '
                                        'and paragraph layout are not included.',
                                        'Changed study material must be separately labeled and must not be presented '
                                        'as unchanged publisher text.',
                                        'No third-party recorded audio, illustrations, maps or modern revisions are '
                                        'included or licensed by this text import.'],
                         'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm']},
 'deu-textbibel1906': {'name': 'Textbibel von Kautzsch und Weizsäcker (1906)',
                       'abbreviation': 'TKW',
                       'language': 'de',
                       'corpus': 'bible',
                       'publisher': 'eBible.org',
                       'translator': 'Emil Kautzsch and Carl Weizsäcker',
                       'providerId': 'deutkw',
                       'revision': '1906; Textbibel.de digitization with Hans J. Herbst',
                       'canon': 'protestant-66',
                       'sourceUpdatedAt': '2025-12-12',
                       'rightsObservedAt': '2026-11-05',
                       'sourceUrl': 'https://ebible.org/deutkw/',
                       'formatUrl': 'https://ebible.org/find/details.php?id=deutkw',
                       'downloadUrl': 'https://ebible.org/Scriptures/deutkw_vpl.zip',
                       'downloadBytes': 4923760,
                       'licenseUrl': 'https://ebible.org/deutkw/copyright.htm',
                       'license': 'Public domain (provider-declared)',
                       'licenseIdentifier': 'LicenseRef-Public-Domain',
                       'attribution': 'Textbibel von Kautzsch und Weizsäcker (1906). Emil Kautzsch and Carl '
                                      'Weizsäcker. 1906; Textbibel.de digitization with Hans J. Herbst. Public domain '
                                      'as declared by eBible.org; source dated 2025-12-12.',
                       'sha256': '0ecc099d7d8ad4cf6fedd3a35d3792423e38a70e4c23e8a9102b5164810298b5',
                       'xmlSha256': '20def02a483b0b3c394cf9475f26d6f966b06a3a65d19c3e6bfa837b757f3cee',
                       'textSha256': 'd8c190aa0013f0af130c45a501d2d221236a7bda14ff119bfc7436dd631c0246',
                       'noticeSha256': '56e5434ca2980bd5cdff36300e206cc44ad55101911a290b2fb82e3977851501',
                       'bracketExceptionCount': 0,
                       'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                       'bracketExceptionScope': '0 source records differ only in the recorded square-bracket '
                                                'positions. Display text preserves the complete original TXT, '
                                                'including any brackets crossing verse boundaries; no source text is '
                                                'repaired or renumbered.',
                       'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31157},
                       'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
                       'conditions': ['Keep the exact historical edition, provider source and complete notice with '
                                      'redistributed/offline copies.',
                                      'The individual edition notice and provider policies declare this text public '
                                      'domain; this is provider evidence, not an independent worldwide legal opinion.',
                                      'The VPL source contains scripture text only; notes, introductions, headings and '
                                      'paragraph layout are not included.',
                                      'Changed study material must be separately labeled and must not be presented as '
                                      'unchanged publisher text.',
                                      'No third-party recorded audio, illustrations, maps or modern revisions are '
                                      'included or licensed by this text import.'],
                       'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm']},
 'ces-kralicka1613': {'name': 'Bible Kralická 1613',
                      'abbreviation': 'BKR',
                      'language': 'cs',
                      'corpus': 'bible',
                      'publisher': 'eBible.org',
                      'translator': 'Jan Blahoslav et al',
                      'providerId': 'ces1613',
                      'revision': 'Last Kralická edition, 1613; translation history 1579–1593',
                      'canon': 'protestant-66',
                      'sourceUpdatedAt': '2025-12-12',
                      'rightsObservedAt': '2026-11-05',
                      'sourceUrl': 'https://ebible.org/ces1613/',
                      'formatUrl': 'https://ebible.org/find/details.php?id=ces1613',
                      'downloadUrl': 'https://ebible.org/Scriptures/ces1613_vpl.zip',
                      'downloadBytes': 4668076,
                      'licenseUrl': 'https://ebible.org/ces1613/copyright.htm',
                      'license': 'Public domain (provider-declared)',
                      'licenseIdentifier': 'LicenseRef-Public-Domain',
                      'attribution': 'Bible Kralická 1613. Jan Blahoslav et al. Last Kralická edition, 1613; '
                                     'translation history 1579–1593. Public domain as declared by eBible.org; source '
                                     'dated 2025-12-12.',
                      'sha256': 'a85f19f62f9e0c9d9d4b8735b2149772a745576ff4b73cfa15d17a6b4b2cd8ae',
                      'xmlSha256': 'b0820cb0fe4110416fc07446397d433dfbfc7872c60d3c3a5d6e90e204d8b78b',
                      'textSha256': 'a05101c669619e8edf825c577ab5ff09968595b951b7d76f7eafb5a9aa1e3fa2',
                      'noticeSha256': 'a29cda27471143d1f44242f70db95fdeb8b6face6a972136fc024485a9b9f971',
                      'bracketExceptionCount': 0,
                      'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                      'bracketExceptionScope': '0 source records differ only in the recorded square-bracket positions. '
                                               'Display text preserves the complete original TXT, including any '
                                               'brackets crossing verse boundaries; no source text is repaired or '
                                               'renumbered.',
                      'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31172},
                      'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
                      'conditions': ['Keep the exact historical edition, provider source and complete notice with '
                                     'redistributed/offline copies.',
                                     'The individual edition notice and provider policies declare this text public '
                                     'domain; this is provider evidence, not an independent worldwide legal opinion.',
                                     'The VPL source contains scripture text only; notes, introductions, headings and '
                                     'paragraph layout are not included.',
                                     'Changed study material must be separately labeled and must not be presented as '
                                     'unchanged publisher text.',
                                     'No third-party recorded audio, illustrations, maps or modern revisions are '
                                     'included or licensed by this text import.'],
                      'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm']},
 'ita-diodati1885': {'name': 'Diodati Bibbia 1885',
                     'abbreviation': 'DIO1885',
                     'language': 'it',
                     'corpus': 'bible',
                     'publisher': 'eBible.org',
                     'translator': 'Giovanni Diodati; United Bible Societies contributor',
                     'providerId': 'ita1885',
                     'revision': '1885 edition title; notice: translated 1641 and revised 1821',
                     'canon': 'protestant-66',
                     'sourceUpdatedAt': '2025-05-03',
                     'rightsObservedAt': '2026-11-05',
                     'sourceUrl': 'https://ebible.org/ita1885/',
                     'formatUrl': 'https://ebible.org/find/details.php?id=ita1885',
                     'downloadUrl': 'https://ebible.org/Scriptures/ita1885_vpl.zip',
                     'downloadBytes': 4672839,
                     'licenseUrl': 'https://ebible.org/ita1885/copyright.htm',
                     'license': 'Public domain (provider-declared)',
                     'licenseIdentifier': 'LicenseRef-Public-Domain',
                     'attribution': 'Diodati Bibbia 1885. Giovanni Diodati; United Bible Societies contributor. 1885 '
                                    'edition title; notice: translated 1641 and revised 1821. Public domain as '
                                    'declared by eBible.org; source dated 2025-05-03.',
                     'sha256': '9d2245ddc8b263cd5331225d8c3873a4a5d2471eaad9ea5a5d8a527625443ef7',
                     'xmlSha256': '9de50cb296f3c3277c5bb9dfa2b4e6d922ade5ca8473a8b155be3c372c98a3e2',
                     'textSha256': 'a5b7237987519ef0bf6828b595dcd0f1cf81e0a5cd748809ec2abe9cba7437de',
                     'noticeSha256': '02b787a593a2fc3bcc95286b025da70f2fdf69e8c05bfc6dc9d354d537fa85d4',
                     'bracketExceptionCount': 14560,
                     'bracketExceptionInventorySha256': '48b26f4b6495dd80fdf0e8a0cb489dd1be562d6953cb7aeb3b278411acba92a1',
                     'bracketExceptionScope': '14560 source records differ only in the recorded square-bracket '
                                              'positions. Display text preserves the complete original TXT, including '
                                              'any brackets crossing verse boundaries; no source text is repaired or '
                                              'renumbered.',
                     'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31095},
                     'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
                     'conditions': ['Keep the exact historical edition, provider source and complete notice with '
                                    'redistributed/offline copies.',
                                    'The individual edition notice and provider policies declare this text public '
                                    'domain; this is provider evidence, not an independent worldwide legal opinion.',
                                    'The VPL source contains scripture text only; notes, introductions, headings and '
                                    'paragraph layout are not included.',
                                    'Changed study material must be separately labeled and must not be presented as '
                                    'unchanged publisher text.',
                                    'No third-party recorded audio, illustrations, maps or modern revisions are '
                                    'included or licensed by this text import.'],
                     'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm']}})


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def edition_metadata(edition_id):
    source = SOURCES[edition_id]
    fields = ('name', 'language', 'corpus', 'publisher', 'translator', 'sourceUpdatedAt', 'sourceUrl', 'formatUrl',
              'downloadUrl', 'licenseUrl', 'license', 'licenseIdentifier', 'licenseDeedUrl', 'attribution', 'sha256', 'rights', 'conditions',
              'abbreviation', 'revision', 'canon', 'providerId', 'downloadBytes')
    value = {'id': edition_id, **{key: source[key] for key in fields if key in source}}
    value.update({'rightsObservedAt': source.get('rightsObservedAt', OBSERVED_ON), 'commercialUse': True,
                  'referenceSystemId': f'{edition_id}:publisher-numbering',
                  'noticePath': f'{edition_id}/NOTICE.txt', 'manifestPath': f'{edition_id}/manifest.json',
                  'totals': source['expectedTotals']})
    if source['corpus'] == 'bible':
        value.update({'booksPath': f'{edition_id}/books/', 'searchIndexPath': f'{edition_id}/search-index.json'})
        if source.get('format') == 'usj-3.0':
            value['chaptersPath'] = f'{edition_id}/chapters/'
    else:
        value['quranPath'] = f'{edition_id}/quran.json'
    return value


class NoticeText(HTMLParser):
    """Extract publisher notice text, never execute or render its HTML."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.excluded = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.excluded += 1
        if not self.excluded and tag in ('p', 'br', 'div', 'li', 'h1', 'h2', 'h3', 'hr'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.excluded:
            self.excluded -= 1
        if not self.excluded and tag in ('p', 'div', 'li', 'h1', 'h2', 'h3'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.excluded:
            self.parts.append(data)

    def text(self):
        # This affects the notice layout only, never scripture display text.
        return '\n'.join(line.strip() for line in ''.join(self.parts).splitlines() if line.strip()) + '\n'


def archive_bytes(edition_id, source_dir, download=False):
    source_dir = source_dir.resolve()
    if source_dir.is_relative_to(ROOT):
        raise ValueError('Keep raw source archives outside the Git repository.')
    path = source_dir / f'{edition_id}.zip'
    source = SOURCES[edition_id]
    if not path.exists():
        if not download:
            raise ValueError(f'Missing {path}; use --download or supply the pinned archive.')
        source_dir.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(source['downloadUrl'], headers={
            'User-Agent': 'Adigun-AiBible source importer/0.1', 'Accept-Encoding': 'identity'})
        parts, count = [], 0
        with urllib.request.urlopen(request, timeout=45) as response:
            expected = int(response.headers['Content-Length']) if response.headers.get('Content-Length') else None
            while chunk := response.read(128 * 1024):
                count += len(chunk)
                if count > MAX_ARCHIVE_BYTES:
                    raise ValueError('Archive exceeds the 20 MB download limit.')
                parts.append(chunk)
        if expected is not None and count != expected:
            raise ValueError(f'Truncated download: received {count} of {expected} bytes.')
        raw = b''.join(parts)
        if sha(raw) != source['sha256']:
            raise ValueError(f'{edition_id}: downloaded archive differs from the pinned source; review the publisher update.')
        path.write_bytes(raw)
    if path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError('Archive exceeds the 20 MB input limit.')
    raw = path.read_bytes()
    if sha(raw) != source['sha256']:
        raise ValueError(f'{edition_id}: archive checksum mismatch; no output changed.')
    return raw


def member(archive, name, expected_sha=None):
    info = archive.getinfo(name)
    if info.file_size > MAX_MEMBER_BYTES or info.is_dir():
        raise ValueError(f'Unexpected archive member: {name}')
    raw = archive.read(name)  # zipfile verifies the member CRC.
    if expected_sha and sha(raw) != expected_sha:
        raise ValueError(f'Archive member checksum mismatch: {name}')
    return raw


def valid_text(text):
    return '\ufffd' not in text and not any(ord(c) < 32 and c not in '\t\n\r' for c in text)


def vpl_format_difference(edition_id, xml_row, text_row):
    """Explain only the reviewed source-specific XML/TXT formatting differences.

    Comparison normalization never changes the authoritative TXT display value.
    Sources accepting omitted square brackets pin the complete coordinate inventory.
    """
    if xml_row['text'] == text_row['text']:
        return None
    text = text_row['text']
    record = {'bookId': text_row['bookId'], 'chapter': text_row['chapter'], 'verse': text_row['verse']}
    if edition_id == 'deu1912':
        pattern = r'\[([1-9]\d*(?::[1-9]\d*)?[a-z]?)\]'
        markers = list(re.finditer(pattern, text))
        if markers and re.sub(pattern, r'\1', text) == xml_row['text']:
            return {**record, 'publisherMarkers': [marker[0] for marker in markers]}
    elif SOURCES[edition_id].get('bracketExceptionCount', 0) > 0:
        brackets = list(re.finditer(r'[\[\]]', text))
        if brackets and text.replace('[', '').replace(']', '') == xml_row['text']:
            return {**record, 'publisherMarkers': [marker[0] for marker in re.finditer(r'\[[^\[\]\r\n]+\]', text)],
                    'bracketPositions': [{'offset': marker.start(), 'character': marker[0]} for marker in brackets]}
    raise ValueError('Publisher exports disagree beyond the pinned source-specific bracket format exception.')


def verify_vpl_format_inventory(edition_id, differences):
    source = SOURCES[edition_id]
    if 'bracketExceptionCount' in source:
        if len(differences) != source['bracketExceptionCount'] or sha(json_bytes(differences)) != source['bracketExceptionInventorySha256']:
            raise ValueError(f'{edition_id}: publisher bracket exception inventory changed.')
    elif len(differences) != (358 if edition_id == 'deu1912' else 0):
        raise ValueError('The publisher numbering-marker exception inventory changed.')


def bible_artifacts(edition_id, archive):
    source = SOURCES[edition_id]
    provider_id = source.get('providerId', edition_id)
    xml_name, text_name, notice_name = (f'{provider_id}_{suffix}' for suffix in ('vpl.xml', 'vpl.txt', 'about.htm'))
    xml = member(archive, xml_name, source['xmlSha256'])
    plain = member(archive, text_name, source['textSha256'])
    notice = member(archive, notice_name, source['noticeSha256'])
    if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml:
        raise ValueError('External/entity declarations are not accepted in source XML.')
    document = ET.fromstring(xml)
    if document.tag != 'verseFile':
        raise ValueError('Unexpected publisher XML root.')
    books = OrderedDict((bid, {'id': bid, 'name': name, 'chapters': []}) for bid, name in BOOKS)
    rows, seen_book_order = [], []
    for verse in document:
        if verse.tag != 'v' or len(verse) or set(verse.attrib) != {'b', 'c', 'v'}:
            raise ValueError('Unexpected XML structure; source review is required.')
        bid, chapter_label, verse_label = (verse.attrib[key] for key in ('b', 'c', 'v'))
        if bid not in books or not re.fullmatch(r'[1-9]\d*', chapter_label) or not re.fullmatch(r'[1-9]\d*', verse_label):
            raise ValueError(f'Unsupported publisher reference: {verse.attrib}')
        chapter, number = int(chapter_label), int(verse_label)
        text = (verse.text or '').strip(ASCII_PADDING)
        if not valid_text(text):
            raise ValueError(f'Invalid source characters at {bid} {chapter}:{number}')
        if not seen_book_order or seen_book_order[-1] != bid:
            if bid in seen_book_order:
                raise ValueError(f'Noncontiguous source book: {bid}')
            seen_book_order.append(bid)
        chapters = books[bid]['chapters']
        if chapter == len(chapters) + 1:
            chapters.append({'number': chapter, 'verses': []})
        if chapter != len(chapters) or (chapters[-1]['verses'] and number <= chapters[-1]['verses'][-1]['number']):
            raise ValueError(f'Duplicate/out-of-order reference: {bid} {chapter}:{number}')
        chapters[-1]['verses'].append({'number': number, 'text': text})
        rows.append({'bookId': bid, 'chapter': chapter, 'verse': number, 'text': text, 'editionId': edition_id})
    if seen_book_order != list(books):
        raise ValueError('The publisher export must contain all 66 canonical books in order.')
    independent_rows = []
    for line in plain.decode('utf-8-sig').splitlines():
        match = re.fullmatch(r'([A-Z0-9]{3}) (\d+):(\d+) (.*)', line)
        if not match:
            raise ValueError('Unexpected publisher VPL text line.')
        bid, chapter, number, text = match.groups()
        independent_rows.append({'bookId': TEXT_IDS.get(bid, bid), 'chapter': int(chapter), 'verse': int(number),
                                 'text': text.strip(ASCII_PADDING), 'editionId': edition_id})
    formatting_differences = []
    if len(rows) != len(independent_rows):
        raise ValueError('Publisher XML and plain-text exports have different reference counts.')
    for xml_row, text_row in zip(rows, independent_rows):
        if {key: value for key, value in xml_row.items() if key != 'text'} != {key: value for key, value in text_row.items() if key != 'text'}:
            raise ValueError('Publisher XML and plain-text references disagree.')
        difference = vpl_format_difference(edition_id, xml_row, text_row)
        if difference is not None:
            formatting_differences.append(difference)
    verify_vpl_format_inventory(edition_id, formatting_differences)
    # Preserve every TXT bracket, including ASV brackets spanning source verses.
    # Bracket removal is comparison-only, never a source or output modification.
    rows = independent_rows
    display_text = {(row['bookId'], row['chapter'], row['verse']): row['text'] for row in rows}
    for bid, book in books.items():
        for chapter in book['chapters']:
            for verse in chapter['verses']:
                verse['text'] = display_text[(bid, chapter['number'], verse['number'])]
    inventory, omitted = [], []
    for bid, book in books.items():
        maxima, record_counts = [], []
        for chapter in book['chapters']:
            numbers = [verse['number'] for verse in chapter['verses']]
            maxima.append(max(numbers))
            record_counts.append(len(numbers))
            missing = sorted(set(range(1, max(numbers) + 1)) - set(numbers))
            if missing:
                omitted.append({'bookId': bid, 'chapter': chapter['number'], 'verseNumbers': missing})
        inventory.append({'id': bid, 'name': book['name'], 'chapters': len(book['chapters']),
                          'verseCounts': maxima, 'verseRecordCounts': record_counts})
    totals = {'books': len(books), 'chapters': sum(b['chapters'] for b in inventory), 'verses': len(rows)}
    if totals != source['expectedTotals']:
        raise ValueError(f'{edition_id}: unexpected source totals {totals}')
    manifest = {'schemaVersion': 1, 'edition': edition_metadata(edition_id), 'books': inventory, 'totals': totals,
                'verseCountSemantics': 'verseCounts is the maximum numbered verse in each chapter; verseRecordCounts is the number of source records. Omitted positions are not fabricated.'}
    parser = NoticeText()
    parser.feed(notice.decode('utf-8-sig'))
    notice_text = parser.text() + '\nSource and rights notice: ' + source['licenseUrl'] + '\n'
    if source.get('licenseDeedUrl'):
        notice_text += 'License: ' + source['licenseDeedUrl'] + '\n'
    for url in source.get('rightsEvidenceUrls', []):
        notice_text += 'Provider rights policy: ' + url + '\n'
    files = {f'books/{bid}.json': json_bytes(book) for bid, book in books.items()}
    files.update({'manifest.json': json_bytes(manifest), 'search-index.json': json_bytes(rows), 'NOTICE.txt': notice_text.encode('utf-8')})
    provenance = {
        'members': {xml_name: sha(xml), text_name: sha(plain), notice_name: sha(notice)},
        'displayTextMember': text_name,
        'xmlAndPlainTextAgree': not formatting_differences,
        'xmlPlainTextCrossCheck': 'Exact agreement except the recorded publisher numeric-marker brackets; all other characters and references agree.' if formatting_differences else 'Exact agreement.',
        'publisherNumberingMarkerFormatDifferences': formatting_differences if edition_id == 'deu1912' else [],
        'normalization': ['Decode source XML entities and UTF-8 byte-order marks.', 'Remove only ASCII XML/VPL padding at verse boundaries.',
                          'Map publisher VPL text book abbreviations to the equivalent XML book identifiers for validation.',
                          'Use the publisher VPL TXT as display text, retaining its bracketed alternate-numbering annotations.',
                          'Preserve canonical verse spelling, punctuation, numbering, diacritics and Unicode normalization exactly.'],
        'limitations': ['Publisher VPL excludes footnotes, section headings, introductions and paragraph layout.',
                       'Canonical navigation book names are the application English catalog labels, not a claimed translation of the edition title.'],
        'omittedNumberedPositions': omitted,
        'emptySourceRecords': [{'bookId': r['bookId'], 'chapter': r['chapter'], 'verse': r['verse']} for r in rows if not r['text']],
        'totals': totals,
    }
    if 'bracketExceptionCount' in source:
        provenance.update({
            'xmlPlainTextCrossCheck': 'All words, punctuation and references agree after comparison-only removal of the recorded TXT square brackets. Display text retains every bracket unchanged.',
            'publisherBracketFormatDifferences': formatting_differences,
            'publisherBracketInventorySha256': sha(json_bytes(formatting_differences)),
            'publisherBracketOffsetUnit': 'unicode-codepoint',
            'publisherBracketScope': source.get('bracketExceptionScope', '4316 balanced supplied-word/other bracket spans and 76 verse-level unpaired cases, including Selah/Higgaion markers and John 7:53–8:11 textual-variant brackets. The original TXT is not repaired or renumbered.'),
        })
        provenance['normalization'][3] = 'Use publisher VPL TXT unchanged as display text, retaining supplied-word, musical-marker and textual-variant brackets.'
    return files, provenance


def quran_artifacts(edition_id, archive):
    source = SOURCES[edition_id]
    text_name = 'clearquran-allah-edition.txt'
    raw = member(archive, text_name, source['textSha256'])
    readme = member(archive, '_readme.txt')
    surahs = []
    comment_lines = []
    for line in raw.decode('utf-8-sig').splitlines():
        if not line:
            continue
        if line.startswith('#'):
            comment_lines.append(line)
            continue
        match = re.fullmatch(r'([1-9]\d*)\|([1-9]\d*)\|(.*)', line)
        if not match:
            raise ValueError('Unexpected ClearQuran row; source review is required.')
        surah_number, verse_number = int(match[1]), int(match[2])
        text = match[3]  # Do not strip, normalize or rewrite translation text.
        if not text or not valid_text(text):
            raise ValueError(f'Invalid ClearQuran text at {surah_number}:{verse_number}')
        if surah_number == len(surahs) + 1:
            surahs.append({'number': surah_number, 'verses': []})
        if surah_number != len(surahs) or verse_number != len(surahs[-1]['verses']) + 1:
            raise ValueError(f'Duplicate/missing ClearQuran reference: {surah_number}:{verse_number}')
        surahs[-1]['verses'].append({'number': verse_number, 'text': text})
    totals = {'surahs': len(surahs), 'verses': sum(len(s['verses']) for s in surahs)}
    if totals != source['expectedTotals']:
        raise ValueError(f'ClearQuran has unexpected source totals: {totals}')
    if 'CC BY-ND 4.0' not in readme.decode('utf-8-sig'):
        raise ValueError('The source copyright notice does not match the reviewed license.')
    notice = (readme.decode('utf-8-sig') + '\n' + source['attribution'] + '\n\n'
              + '\n'.join(source['conditions']) + '\n\nCurrent publisher terms: ' + source['licenseUrl'] + '\n')
    files = {
        'quran.json': json_bytes({'schemaVersion': 1, 'editionId': edition_id, 'surahs': surahs}),
        'manifest.json': json_bytes({'schemaVersion': 1, 'edition': edition_metadata(edition_id), 'totals': totals,
                                    'surahs': [{'number': s['number'], 'verseCount': len(s['verses'])} for s in surahs]}),
        'NOTICE.txt': notice.encode('utf-8'),
    }
    return files, {'members': {text_name: sha(raw), '_readme.txt': sha(readme)}, 'totals': totals,
                   'normalization': ['Decode UTF-8 byte-order mark and line delimiters.',
                                     'Parse numeric surah/verse delimiters only; preserve every translation text character.',
                                     'Keep publisher metadata comments outside the scripture text.'],
                   'sourceMetadataComments': comment_lines,
                   'limitations': ['English translation of Quran meanings; not Arabic source text.',
                                   'No Quran paraphrases or Bible–Quran editorial comparisons are approved by this import.']}


def usj_bible_artifacts(edition_id, archive):
    """Preserve publisher verse identifiers, notes, headings, and paragraph/character spans.

    The publisher's unnumbered text-only export must not be used to derive verse
    numbers: it omits absent verses. Only explicit USJ verse milestones identify
    source units here. Source character offsets are Unicode code-point offsets.
    """
    source = SOURCES[edition_id]
    expected_members = {f'{book_id}.usj' for book_id, _ in BOOKS}
    if set(archive.namelist()) != expected_members or len(archive.namelist()) != len(expected_members):
        raise ValueError('USJ archive must contain exactly the 66 identified source books.')
    heading_styles = {'h', 'toc1', 'toc2', 'toc3', 'mt1', 's1', 's2', 'r', 'd', 'ms', 'qa'}
    body_styles = {'p', 'b', 'li1', 'li2', 'q1', 'q2', 'lf', 'qr', 'pc'}
    files, rows, inventory, omitted, source_members = {}, [], [], [], {}
    annotation_totals = {'headings': 0, 'notes': 0, 'verseNotes': 0, 'headingNotes': 0, 'paragraphs': 0, 'characterSpans': 0}

    def flatten(node):
        if isinstance(node, str):
            return node
        if isinstance(node, dict) and node.get('type') == 'verse':
            return ''  # Milestones can occur inside a supplied Psalm superscription.
        if not isinstance(node, dict) or node.get('type') not in {'ref', 'char', 'note', 'para'}:
            raise ValueError('Unsupported USJ annotation structure.')
        return ''.join(flatten(child) for child in node.get('content', []))

    def heading_record(node):
        # A footnote belongs to its own annotation, never to the visible heading.
        parts, notes, offset = [], [], 0

        def collect(part):
            nonlocal offset
            if isinstance(part, str):
                if not valid_text(part):
                    raise ValueError('Invalid USJ heading text.')
                parts.append(part)
                offset += len(part)
            elif not isinstance(part, dict):
                raise ValueError('Invalid USJ heading annotation.')
            elif part.get('type') == 'verse':
                return
            elif part.get('type') == 'note':
                if part.get('marker') != 'f':
                    raise ValueError('Unsupported USJ heading note.')
                notes.append({'at': offset, 'marker': part['marker'], 'caller': part.get('caller', ''),
                              'text': flatten(part), 'content': part.get('content', [])})
            elif part.get('type') in {'para', 'char', 'ref'}:
                for child in part.get('content', []):
                    collect(child)
            else:
                raise ValueError('Unsupported USJ heading annotation.')

        collect(node)
        return {'style': node['marker'], 'text': ''.join(parts), 'content': node.get('content', []),
                **({'notes': notes, 'offsetUnit': 'unicode-codepoint'} if notes else {})}

    for book_id, book_name in BOOKS:
        raw = member(archive, f'{book_id}.usj')
        source_members[f'{book_id}.usj'] = sha(raw)
        doc = json.loads(raw.decode('utf-8'))
        if doc.get('type') != 'USJ' or doc.get('version') != '3.0' or not isinstance(doc.get('content'), list):
            raise ValueError('Unsupported USJ source version or root.')
        book = {'id': book_id, 'name': book_name, 'chapters': [], 'frontMatter': []}
        chapter, verse, paragraph = None, None, None
        book_identity = False

        def append(text):
            if not isinstance(text, str) or not valid_text(text):
                raise ValueError('Invalid USJ source text.')
            if verse is not None:
                start = len(verse['text'])
                verse['text'] += text
                if paragraph is not None and text:
                    if paragraph['spans'] and paragraph['spans'][-1]['verse'] == verse['number']:
                        paragraph['spans'][-1]['end'] = len(verse['text'])
                    else:
                        paragraph['spans'].append({'verse': verse['number'], 'start': start, 'end': len(verse['text'])})
            elif text.strip(ASCII_PADDING):
                raise ValueError('Unassigned body text before a source verse.')

        def walk(node):
            nonlocal verse
            if isinstance(node, str):
                append(node)
                return
            if not isinstance(node, dict):
                raise ValueError('Invalid USJ body node.')
            kind = node.get('type')
            if kind == 'verse':
                if chapter is None or node.get('marker') != 'v' or not re.fullmatch(r'[1-9]\d*', str(node.get('number', ''))):
                    raise ValueError('Unsupported verse milestone/range; do not fabricate numbering.')
                number = int(node['number'])
                if node.get('sid') != f'{book_id} {chapter["number"]}:{number}' or (verse is not None and number <= verse['number']):
                    raise ValueError('Duplicate, out-of-order or inconsistent USJ verse identity.')
                verse = {'number': number, 'text': '', 'notes': [], 'characterSpans': []}
                chapter['verses'].append(verse)
            elif kind == 'note':
                if verse is None or node.get('marker') != 'f':
                    raise ValueError('Unassigned or unsupported source note.')
                verse['notes'].append({'at': len(verse['text']), 'marker': node['marker'], 'caller': node.get('caller', ''),
                                       'text': flatten(node), 'content': node.get('content', [])})
            elif kind in {'char', 'ref'}:
                if verse is None:
                    raise ValueError('Unassigned USJ character span.')
                if kind == 'char' and node.get('marker') not in {'add', 'wj'}:
                    raise ValueError('Unsupported running-text character marker.')
                start = len(verse['text'])
                for child in node.get('content', []):
                    walk(child)
                verse['characterSpans'].append({'start': start, 'end': len(verse['text']),
                                                'marker': node.get('marker', 'ref'), **({'loc': node['loc']} if kind == 'ref' else {})})
            else:
                raise ValueError(f'Unsupported USJ body node type: {kind}')

        for node in doc['content']:
            if not isinstance(node, dict):
                raise ValueError('Unexpected top-level source text.')
            if node.get('type') == 'book':
                if book_identity or chapter is not None or node.get('code') != book_id:
                    raise ValueError('USJ book identity mismatch.')
                book_identity = True
            elif node.get('type') == 'chapter':
                number = int(node.get('number', 0))
                if number != len(book['chapters']) + 1 or node.get('sid') != f'{book_id} {number}':
                    raise ValueError('USJ chapter inventory or identity mismatch.')
                chapter = {'number': number, 'verses': [], 'headings': [], 'paragraphs': [], 'offsetUnit': 'unicode-codepoint'}
                book['chapters'].append(chapter)
                verse, paragraph = None, None
            elif node.get('type') == 'para':
                style = node.get('marker')
                # The publisher uses `d` for Psalm superscriptions, but also for
                # the canonical first sentence of Zechariah 12:1. Preserve that
                # sentence as verse text; retain Psalm titles as labeled context.
                descriptive_body = style == 'd' and book_id != 'PSA'
                if style in heading_styles and not descriptive_body:
                    heading = heading_record(node)
                    annotation_totals['headingNotes'] += len(heading.get('notes', []))
                    if chapter is None:
                        book['frontMatter'].append(heading)
                    else:
                        chapter['headings'].append({'afterVerse': verse['number'] if verse is not None else None, **heading})
                    for child in node.get('content', []):
                        if isinstance(child, dict) and child.get('type') == 'verse':
                            walk(child)
                    annotation_totals['headings'] += 1
                elif style in body_styles or descriptive_body:
                    if chapter is None:
                        raise ValueError('Body paragraph before first chapter.')
                    paragraph = {'style': style, 'spans': []}
                    chapter['paragraphs'].append(paragraph)
                    # USJ paragraph boundaries are layout, not punctuation. An
                    # explicit separating space retains running-text words.
                    if verse is not None and verse['text'] and not verse['text'][-1].isspace():
                        verse['text'] += ' '
                    for child in node.get('content', []):
                        walk(child)
                    paragraph = None
                    annotation_totals['paragraphs'] += 1
                else:
                    raise ValueError(f'Unsupported USJ paragraph style: {style}')
            else:
                raise ValueError('Unsupported USJ top-level structure.')
        if not book_identity:
            raise ValueError('Missing USJ book identity.')
        maxima, counts = [], []
        for chapter in book['chapters']:
            if not chapter['verses']:
                raise ValueError('Empty source chapter.')
            for verse in chapter['verses']:
                trim_start = len(verse['text']) - len(verse['text'].lstrip(ASCII_PADDING))
                verse['text'] = verse['text'].strip(ASCII_PADDING)
                if not verse['text']:
                    raise ValueError('Empty source verse needs explicit review.')
                bound = lambda offset: max(0, min(len(verse['text']), offset - trim_start))
                for note in verse['notes']:
                    note['at'] = bound(note['at'])
                for span in verse['characterSpans']:
                    span.update(start=bound(span['start']), end=bound(span['end']))
                for paragraph in chapter['paragraphs']:
                    for span in paragraph['spans']:
                        if span['verse'] == verse['number']:
                            span.update(start=bound(span['start']), end=bound(span['end']))
                annotation_totals['verseNotes'] += len(verse['notes'])
                annotation_totals['characterSpans'] += len(verse['characterSpans'])
                rows.append({'bookId': book_id, 'chapter': chapter['number'], 'verse': verse['number'], 'text': verse['text'], 'editionId': edition_id})
            numbers = [verse['number'] for verse in chapter['verses']]
            maxima.append(max(numbers)); counts.append(len(numbers))
            missing = sorted(set(range(1, max(numbers) + 1)) - set(numbers))
            if missing:
                omitted.append({'bookId': book_id, 'chapter': chapter['number'], 'verseNumbers': missing})
            files[f'chapters/{book_id}/{chapter["number"]}.json'] = json_bytes({'schemaVersion': 1, 'editionId': edition_id, 'bookId': book_id, **chapter})
        inventory.append({'id': book_id, 'name': book_name, 'chapters': len(book['chapters']), 'verseCounts': maxima, 'verseRecordCounts': counts})
        files[f'books/{book_id}.json'] = json_bytes(book)
    totals = {'books': len(inventory), 'chapters': sum(item['chapters'] for item in inventory), 'verses': len(rows)}
    if totals != source['expectedTotals']:
        raise ValueError(f'USJ source totals changed: {totals}')
    annotation_totals['notes'] = annotation_totals['verseNotes'] + annotation_totals['headingNotes']
    manifest = {'schemaVersion': 1, 'edition': edition_metadata(edition_id), 'books': inventory, 'totals': totals,
                'verseCountSemantics': 'Explicit publisher USJ verse milestones. Missing verse positions are absent, never renumbered.',
                'sourceStructure': {**annotation_totals, 'offsetUnit': 'unicode-codepoint', 'speakerReviewStatus': 'publisher-markup-only-not-independently-reviewed'}}
    notice = (source['attribution'] + '\n\nThe Berean Bible text was dedicated to the public domain on April 30, 2023. All uses are freely permitted.\n'
              + '\n'.join(source['conditions']) + '\n\nPublisher terms: ' + source['licenseUrl'] + '\n'
              + 'Pinned publisher release: ' + source['formatUrl'] + '\n')
    files.update({'manifest.json': json_bytes(manifest), 'search-index.json': json_bytes(rows), 'NOTICE.txt': notice.encode('utf-8')})
    return files, {'members': source_members, 'format': source['format'], 'totals': totals, 'annotationTotals': annotation_totals,
                   'omittedNumberedPositions': omitted, 'emptySourceRecords': [],
                   'normalization': ['Decode publisher USJ UTF-8 JSON.', 'Use explicit chapter/verse identifiers without renumbering.',
                                     'Keep wording, punctuation and Unicode; concatenate adjacent inline text and separate body paragraph continuations with a space.',
                                     'Remove only ASCII layout padding at verse boundaries.',
                                     'Keep publisher headings, footnotes, poetic paragraph styles and character spans outside the canonical verse text.',
                                     'Keep heading note bodies separate from heading text with Unicode code-point offsets and original note field markup.'],
                   'limitations': ['Publisher words-of-Jesus markers are preserved as source metadata, not independently approved speaker annotations.',
                                   'No interlinear, morphology, third-party lexicon or recorded-audio assets are imported.']}


def build_artifacts(edition_id, raw):
    source = SOURCES[edition_id]
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if len(archive.infolist()) > (66 if source.get('format') == 'usj-3.0' else 20) or sum(i.file_size for i in archive.infolist()) > 80_000_000:
            raise ValueError('Unexpected source archive inventory.')
        importer = usj_bible_artifacts if source.get('format') == 'usj-3.0' else (bible_artifacts if source['corpus'] == 'bible' else quran_artifacts)
        files, extra = importer(edition_id, archive)
    provenance = {'schemaVersion': 1, 'editionId': edition_id, 'sourceUrl': source['sourceUrl'],
                  'downloadUrl': source['downloadUrl'], 'archiveSha256': sha(raw), 'sourceUpdatedAt': source['sourceUpdatedAt'],
                  'rightsObservedAt': source.get('rightsObservedAt', OBSERVED_ON), 'licenseUrl': source['licenseUrl'], **extra,
                  'generatedFileSha256': {name: sha(content) for name, content in files.items()}}
    files['provenance.json'] = json_bytes(provenance)
    return files


def verify_outputs(output, pending_indexes=None):
    catalog = json.loads((output / 'catalog.json').read_text(encoding='utf-8'))
    expected_catalog = {'schemaVersion': 1, 'editions': [edition_metadata(edition_id) for edition_id in SOURCES]}
    if catalog != expected_catalog:
        raise ValueError('Edition catalog metadata differs from pinned rights/source declarations.')
    summaries = []
    for edition_id, source in SOURCES.items():
        directory = output / edition_id
        provenance = json.loads((directory / 'provenance.json').read_text(encoding='utf-8'))
        if provenance['archiveSha256'] != source['sha256'] or provenance['totals'] != source['expectedTotals']:
            raise ValueError(f'{edition_id}: invalid provenance source pin or totals.')
        for name, expected in provenance['generatedFileSha256'].items():
            target = (directory / name).resolve()
            if not target.is_relative_to(directory.resolve()):
                raise ValueError(f'{edition_id}: generated path escapes edition directory: {name}')
            if pending_indexes is not None and source['corpus'] == 'bible' and (name == 'search-index.json' or name.startswith('chapters/')):
                continue  # Regenerate this derived file after validating all committed inputs.
            if sha(target.read_bytes()) != expected:
                raise ValueError(f'{edition_id}: generated content hash mismatch: {name}')
        manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
        if manifest['edition'] != edition_metadata(edition_id) or manifest['totals'] != source['expectedTotals']:
            raise ValueError(f'{edition_id}: manifest metadata mismatch.')
        if source['corpus'] == 'bible':
            rows = []
            for meta in manifest['books']:
                book = json.loads((directory / 'books' / (meta['id'] + '.json')).read_text(encoding='utf-8'))
                if book['id'] != meta['id'] or len(book['chapters']) != meta['chapters']:
                    raise ValueError(f'{edition_id}: incorrect chapter count for {meta["id"]}.')
                for i, chapter in enumerate(book['chapters']):
                    numbers = [v['number'] for v in chapter['verses']]
                    if chapter['number'] != i + 1 or numbers != sorted(set(numbers)) or max(numbers) != meta['verseCounts'][i] or len(numbers) != meta['verseRecordCounts'][i]:
                        raise ValueError(f'{edition_id}: incorrect chapter inventory for {meta["id"]} {i + 1}.')
                    rows.extend({'bookId': book['id'], 'chapter': chapter['number'], 'verse': v['number'], 'text': v['text'], 'editionId': edition_id} for v in chapter['verses'])
                    if source.get('format') == 'usj-3.0' and pending_indexes is not None:
                        name = f'chapters/{book["id"]}/{chapter["number"]}.json'
                        chunk_bytes = json_bytes({'schemaVersion': 1, 'editionId': edition_id, 'bookId': book['id'], **chapter})
                        if sha(chunk_bytes) != provenance['generatedFileSha256'].get(name):
                            raise ValueError(f'{edition_id}: rebuilt chapter differs from pinned output: {name}')
                        pending_indexes.append((directory / name, chunk_bytes))
            if len(rows) != manifest['totals']['verses']:
                raise ValueError(f'{edition_id}: search index differs from displayed source text.')
            if pending_indexes is not None:
                index_bytes = json_bytes(rows)
                if sha(index_bytes) != provenance['generatedFileSha256']['search-index.json']:
                    raise ValueError(f'{edition_id}: rebuilt index differs from the pinned generated output.')
                pending_indexes.append((directory / 'search-index.json', index_bytes))
            else:
                search = json.loads((directory / 'search-index.json').read_text(encoding='utf-8'))
                if rows != search:
                    raise ValueError(f'{edition_id}: search index differs from displayed source text.')
        else:
            corpus = json.loads((directory / 'quran.json').read_text(encoding='utf-8'))
            if len(corpus['surahs']) != 114 or sum(len(s['verses']) for s in corpus['surahs']) != 6236:
                raise ValueError('ClearQuran inventory mismatch.')
        summaries.append({'id': edition_id, 'totals': source['expectedTotals'], 'verified': True})
    return summaries


def rebuild_indexes(output):
    """Rebuild derived search indexes and USJ chapter chunks from verified books."""
    pending = []
    summaries = verify_outputs(output, pending_indexes=pending)
    # No writes occur until every edition's committed inputs and both resulting
    # index hashes have been validated. No archive or network code is involved.
    rebuilt = []
    for target, content in pending:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.importing')
        temporary.write_bytes(content)
        temporary.replace(target)
        if target.name == 'search-index.json':
            rebuilt.append({'id': target.parent.name, 'bytes': len(content), 'sha256': sha(content)})
    return {'mode': 'rebuild-indexes', 'indexes': rebuilt, 'chapterChunks': sum('/chapters/' in str(path) for path, _ in pending), 'editions': summaries}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, help='Directory outside the repository containing ID.zip files.')
    parser.add_argument('--download', action='store_true', help='Download missing pinned archives from publisher URLs.')
    parser.add_argument('--edition', action='append', choices=list(SOURCES), help='Import/check only this source; existing editions are still verified. Repeat for multiple sources.')
    parser.add_argument('--output', type=Path, default=OUTPUT, help='Generated edition directory (default: data/editions).')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--verify', action='store_true', help='Verify generated files without network or raw archives.')
    mode.add_argument('--check', action='store_true', help='Rebuild in memory from pinned archives and compare without writing.')
    mode.add_argument('--rebuild-indexes', action='store_true', help='Recreate only Bible search indexes from committed books and manifests; no network or archives.')
    args = parser.parse_args()
    if args.rebuild_indexes:
        print(json.dumps(rebuild_indexes(args.output), ensure_ascii=False))
        return
    if args.verify:
        print(json.dumps({'editions': verify_outputs(args.output)}, ensure_ascii=False))
        return
    if not args.source_dir:
        parser.error('--source-dir is required for import or --check.')
    generated = {}
    for edition_id in args.edition or SOURCES:
        raw = archive_bytes(edition_id, args.source_dir, args.download)
        generated[edition_id] = build_artifacts(edition_id, raw)
    catalog = json_bytes({'schemaVersion': 1, 'editions': [edition_metadata(edition_id) for edition_id in SOURCES]})
    # Validate all three archives before replacing any generated output.
    for edition_id, files in generated.items():
        for name, content in files.items():
            target = args.output / edition_id / name
            if args.check:
                if not target.exists() or target.read_bytes() != content:
                    raise ValueError(f'Reproducibility mismatch: {edition_id}/{name}')
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_name(target.name + '.importing')
                temporary.write_bytes(content)
                temporary.replace(target)
    target = args.output / 'catalog.json'
    if args.check:
        if not target.exists() or target.read_bytes() != catalog:
            raise ValueError('Reproducibility mismatch: catalog.json')
    else:
        args.output.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.importing')
        temporary.write_bytes(catalog)
        temporary.replace(target)
    print(json.dumps({'mode': 'reproducibility-check' if args.check else 'import',
                      'editions': verify_outputs(args.output)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, ET.ParseError, zipfile.BadZipFile) as error:
        print(f'Edition import failed: {error}', file=sys.stderr)
        raise SystemExit(1)
