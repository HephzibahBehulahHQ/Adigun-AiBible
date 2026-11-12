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
                       'translator': 'Kautzsch und Weizsäcker',
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


# Additional distinct editions admitted from individually reviewed primary notices.
SOURCES.update({'fra-ostervald': {'name': 'French Ostervald Bible',
                   'nativeTitle': 'La Sainte Bible',
                   'abbreviation': 'OST',
                   'language': 'fr',
                   'script': 'Latn',
                   'direction': 'ltr',
                   'corpus': 'bible',
                   'publisher': 'eBible.org',
                   'translator': 'Ostervald',
                   'providerId': 'fra_fob',
                   'revision': 'Ostervald; historical revision year is not specified in the individual '
                               'notice.',
                   'canon': 'protestant-66',
                   'sourceUpdatedAt': '2026-10-30',
                   'sourceNoticeDate': '2026-10-30',
                   'rightsObservedAt': '2026-11-05',
                   'sourceUrl': 'https://ebible.org/fra_fob/',
                   'formatUrl': 'https://ebible.org/find/details.php?id=fra_fob',
                   'downloadUrl': 'https://ebible.org/Scriptures/fra_fob_vpl.zip',
                   'downloadBytes': 4624935,
                   'licenseUrl': 'https://ebible.org/fra_fob/copyright.htm',
                   'license': 'Public domain (provider-declared)',
                   'licenseIdentifier': 'LicenseRef-Public-Domain',
                   'attribution': 'French Ostervald Bible. La Sainte Bible. Ostervald. Ostervald; historical '
                                  'revision year is not specified in the individual notice. Public domain as '
                                  'declared by eBible.org; exact source files dated 2026-10-30; full '
                                  'publisher notice retained.',
                   'sha256': 'db393ba4b0a91b4f631b35b0d27ba796514ff84182de06997669f4a14da52b21',
                   'xmlSha256': 'f9e9e97cba949bde4f86d9fe379be53dcc43a43a919fa7863901c7edca4703ba',
                   'textSha256': 'd844608aa923e6bf3041cf374d9f9475dc9fcc3c23d4629bc51fdaaa8cd3d1b6',
                   'noticeSha256': '31d2eb42b53cc4a4710e7870cc54ce68f54b91f47fc20254c7c7de0bfa0e0e5b',
                   'bracketExceptionCount': 0,
                   'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                   'bracketExceptionScope': '0 source records differ only at the exact pinned square-bracket '
                                            'positions. All display text remains the complete original TXT; '
                                            'no wording or numbering is repaired.',
                   'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31107},
                   'rights': {'redistribute': True,
                              'adapt': True,
                              'offline': True,
                              'audio': True,
                              'export': True},
                   'conditions': ['Retain the exact edition identity, original source wording and complete '
                                  'publisher notice with redistributed/offline copies.',
                                  'Rights evidence is the individual provider declaration and stated '
                                  'provider uses, not independent worldwide legal or human editorial '
                                  'approval; the provider inventory describes public-domain knowledge in the '
                                  'USA and its policy acknowledges national-law variation.',
                                  'Publisher VPL supplies verse text without separate notes, introductions, '
                                  'headings or paragraph layout. Inline source annotations, historical '
                                  'spellings and alternate-numbering text remain unchanged where present.',
                                  'Changed study material must be separately labeled and must not be '
                                  'presented as unchanged publisher text.',
                                  'No third-party recorded audio, cover artwork, illustrations, maps or '
                                  'distinct modern revisions are included or licensed by this text import.',
                                  'No provider certification badge or trademark license is included, and '
                                  'this application is not claimed to be provider-certified.'],
                   'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                          'https://ebible.org/publicdomain.htm'],
                   'preserveSourceNotice': True,
                   'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                        'registryFileDate': '2026-09-17',
                                        'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                        'languageTag': 'fr',
                                        'script': 'Latn',
                                        'direction': 'ltr',
                                        'sourceLetterBidiCounts': {'L': 3248287},
                                        'sourceLetterUnicodeNamePrefixes': {'LATIN': 3248287},
                                        'scope': 'Language identity is supplied by the individual publisher '
                                                 'notice. The IANA registry validates the selected '
                                                 'language/script subtags; direction and observed script are '
                                                 'checked against every source letter. No native-language '
                                                 'approval is asserted.'}},
 'epo-londona': {'name': 'Londona Biblio (Esperanto)',
                 'nativeTitle': 'Londona Biblio',
                 'abbreviation': 'LON',
                 'language': 'eo',
                 'script': 'Latn',
                 'direction': 'ltr',
                 'corpus': 'bible',
                 'publisher': 'eBible.org',
                 'translator': 'Not specified in the publisher notice.',
                 'providerId': 'epo',
                 'revision': '1910, as identified by the publisher notice.',
                 'canon': 'protestant-66',
                 'sourceUpdatedAt': '2025-12-12',
                 'sourceNoticeDate': '2020-02-13',
                 'rightsObservedAt': '2026-11-05',
                 'sourceUrl': 'https://ebible.org/epo/',
                 'formatUrl': 'https://ebible.org/find/details.php?id=epo',
                 'downloadUrl': 'https://ebible.org/Scriptures/epo_vpl.zip',
                 'downloadBytes': 4160085,
                 'licenseUrl': 'https://ebible.org/epo/copyright.htm',
                 'license': 'Public domain (provider-declared)',
                 'licenseIdentifier': 'LicenseRef-Public-Domain',
                 'attribution': 'Londona Biblio (Esperanto). Londona Biblio. Not specified in the publisher '
                                'notice.. 1910, as identified by the publisher notice. Public domain as '
                                'declared by eBible.org; exact source files dated 2025-12-12; full publisher '
                                'notice retained.',
                 'sha256': '2e2859611073a1a023f92e1fd279078f5cedc5f4d97659fc2f8f84945450301d',
                 'xmlSha256': '91588c6d408d884d5330cdd7104023cbe7adefa7253c9e72a27c09ae7fd4dad6',
                 'textSha256': '76c98d7933f2260d8383cc6db91632145e63403a79ca5e0cfd403f6f3251f2e6',
                 'noticeSha256': 'f833af88cb2be31728ed8a8d9f171a40cd5788b7d7c618ee39984b894f6c1a07',
                 'bracketExceptionCount': 2,
                 'bracketExceptionInventorySha256': '85fe22277d74a087f5abd0d3038005c932049a35afb79e67297545c03e480882',
                 'bracketExceptionScope': '2 source records differ only at the exact pinned square-bracket '
                                          'positions. All display text remains the complete original TXT; no '
                                          'wording or numbering is repaired.',
                 'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
                 'rights': {'redistribute': True,
                            'adapt': True,
                            'offline': True,
                            'audio': True,
                            'export': True},
                 'conditions': ['Retain the exact edition identity, original source wording and complete '
                                'publisher notice with redistributed/offline copies.',
                                'Rights evidence is the individual provider declaration and stated provider '
                                'uses, not independent worldwide legal or human editorial approval; the '
                                'provider inventory describes public-domain knowledge in the USA and its '
                                'policy acknowledges national-law variation.',
                                'Publisher VPL supplies verse text without separate notes, introductions, '
                                'headings or paragraph layout. Inline source annotations, historical '
                                'spellings and alternate-numbering text remain unchanged where present.',
                                'Changed study material must be separately labeled and must not be presented '
                                'as unchanged publisher text.',
                                'No third-party recorded audio, cover artwork, illustrations, maps or '
                                'distinct modern revisions are included or licensed by this text import.',
                                'No provider certification badge or trademark license is included, and this '
                                'application is not claimed to be provider-certified.'],
                 'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                        'https://ebible.org/publicdomain.htm'],
                 'preserveSourceNotice': True,
                 'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                      'registryFileDate': '2026-09-17',
                                      'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                      'languageTag': 'eo',
                                      'script': 'Latn',
                                      'direction': 'ltr',
                                      'sourceLetterBidiCounts': {'L': 2960681},
                                      'sourceLetterUnicodeNamePrefixes': {'LATIN': 2960681},
                                      'scope': 'Language identity is supplied by the individual publisher '
                                               'notice. The IANA registry validates the selected '
                                               'language/script subtags; direction and observed script are '
                                               'checked against every source letter. No native-language '
                                               'approval is asserted.'}},
 'arb-vandyck': {'name': 'Arabic Van Dyck Bible',
                 'nativeTitle': 'الكتاب المقدس باللغة العربية، فان دايك',
                 'abbreviation': 'AVD',
                 'language': 'ar',
                 'script': 'Arab',
                 'direction': 'rtl',
                 'corpus': 'bible',
                 'publisher': 'eBible.org',
                 'translator': 'Syrian Mission; contributor: American Bible Society',
                 'providerId': 'arb-vd',
                 'revision': 'Van Dyck; no historical revision year is specified in the individual notice.',
                 'canon': 'protestant-66',
                 'sourceUpdatedAt': '2025-12-12',
                 'sourceNoticeDate': '2020-08-03',
                 'rightsObservedAt': '2026-11-05',
                 'sourceUrl': 'https://ebible.org/arb-vd/',
                 'formatUrl': 'https://ebible.org/find/details.php?id=arb-vd',
                 'downloadUrl': 'https://ebible.org/Scriptures/arb-vd_vpl.zip',
                 'downloadBytes': 5268940,
                 'licenseUrl': 'https://ebible.org/arb-vd/copyright.htm',
                 'license': 'Public domain (provider-declared)',
                 'licenseIdentifier': 'LicenseRef-Public-Domain',
                 'attribution': 'Arabic Van Dyck Bible. الكتاب المقدس باللغة العربية، فان دايك. Syrian '
                                'Mission; contributor: American Bible Society. Van Dyck; no historical '
                                'revision year is specified in the individual notice. Public domain as '
                                'declared by eBible.org; exact source files dated 2025-12-12; full publisher '
                                'notice retained.',
                 'sha256': '070404da2e13e641b7550b50d7e777480b2cc2667e9669f2194d909ca04cd68a',
                 'xmlSha256': 'bac591e723087bc6754a1377837960a969d5477816a6bf16c06a319bfce6f07d',
                 'textSha256': '2cfdf72751acf12cc080dfc7a43843ebc086582481cd11f581956d5f0e7d6f5a',
                 'noticeSha256': 'fc22145aee52f7d95cf3c73bdc5de12f634fa70369b34b6b662def1df4e8b465',
                 'bracketExceptionCount': 0,
                 'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                 'bracketExceptionScope': '0 source records differ only at the exact pinned square-bracket '
                                          'positions. All display text remains the complete original TXT; no '
                                          'wording or numbering is repaired.',
                 'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31104},
                 'rights': {'redistribute': True,
                            'adapt': True,
                            'offline': True,
                            'audio': True,
                            'export': True},
                 'conditions': ['Retain the exact edition identity, original source wording and complete '
                                'publisher notice with redistributed/offline copies.',
                                'Rights evidence is the individual provider declaration and stated provider '
                                'uses, not independent worldwide legal or human editorial approval; the '
                                'provider inventory describes public-domain knowledge in the USA and its '
                                'policy acknowledges national-law variation.',
                                'Publisher VPL supplies verse text without separate notes, introductions, '
                                'headings or paragraph layout. Inline source annotations, historical '
                                'spellings and alternate-numbering text remain unchanged where present.',
                                'Changed study material must be separately labeled and must not be presented '
                                'as unchanged publisher text.',
                                'No third-party recorded audio, cover artwork, illustrations, maps or '
                                'distinct modern revisions are included or licensed by this text import.',
                                'No provider certification badge or trademark license is included, and this '
                                'application is not claimed to be provider-certified.'],
                 'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                        'https://ebible.org/publicdomain.htm'],
                 'preserveSourceNotice': True,
                 'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                      'registryFileDate': '2026-09-17',
                                      'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                      'languageTag': 'ar',
                                      'script': 'Arab',
                                      'direction': 'rtl',
                                      'sourceLetterBidiCounts': {'AL': 1869689},
                                      'sourceLetterUnicodeNamePrefixes': {'ARABIC': 1869689},
                                      'scope': 'Language identity is supplied by the individual publisher '
                                               'notice. The IANA registry validates the selected '
                                               'language/script subtags; direction and observed script are '
                                               'checked against every source letter. No native-language '
                                               'approval is asserted.'}},
 'mya-judson1840': {'name': 'Judson Burmese Bible (1840)',
                    'nativeTitle': 'မြန်မာကျမ်းစာ',
                    'abbreviation': 'JUD1840',
                    'language': 'my',
                    'script': 'Mymr',
                    'direction': 'ltr',
                    'corpus': 'bible',
                    'publisher': 'eBible.org',
                    'translator': 'Adoniram Judson',
                    'providerId': 'myajvb',
                    'revision': 'Judson version of 1840, as identified by the publisher notice.',
                    'canon': 'protestant-66',
                    'sourceUpdatedAt': '2025-12-12',
                    'sourceNoticeDate': '2025-10-20',
                    'rightsObservedAt': '2026-11-05',
                    'sourceUrl': 'https://ebible.org/myajvb/',
                    'formatUrl': 'https://ebible.org/find/details.php?id=myajvb',
                    'downloadUrl': 'https://ebible.org/Scriptures/myajvb_vpl.zip',
                    'downloadBytes': 6159399,
                    'licenseUrl': 'https://ebible.org/myajvb/copyright.htm',
                    'license': 'Public domain (provider-declared)',
                    'licenseIdentifier': 'LicenseRef-Public-Domain',
                    'attribution': 'Judson Burmese Bible (1840). မြန်မာကျမ်းစာ. Adoniram Judson. Judson '
                                   'version of 1840, as identified by the publisher notice. Public domain as '
                                   'declared by eBible.org; exact source files dated 2025-12-12; full '
                                   'publisher notice retained.',
                    'sha256': 'bbbabb35e8373c718a3eb1af4e30ba5efeadd08fc047abde644709bdd7951adf',
                    'xmlSha256': 'dac2c4796507d6068452d0c07983ea350520f19e071656c031098552f54d8d40',
                    'textSha256': 'c8390a0f4f54a0c414796d8f415501c76abebfc5ed3d34c1c661e950c731c9e0',
                    'noticeSha256': 'cd03f38e5f9493cb93dedf0c13c1d7d09e1435c090d3a40032bddea23d5506b5',
                    'bracketExceptionCount': 0,
                    'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                    'bracketExceptionScope': '0 source records differ only at the exact pinned '
                                             'square-bracket positions. All display text remains the '
                                             'complete original TXT; no wording or numbering is repaired.',
                    'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
                    'rights': {'redistribute': True,
                               'adapt': True,
                               'offline': True,
                               'audio': True,
                               'export': True},
                    'conditions': ['Retain the exact edition identity, original source wording and complete '
                                   'publisher notice with redistributed/offline copies.',
                                   'Rights evidence is the individual provider declaration and stated '
                                   'provider uses, not independent worldwide legal or human editorial '
                                   'approval; the provider inventory describes public-domain knowledge in '
                                   'the USA and its policy acknowledges national-law variation.',
                                   'Publisher VPL supplies verse text without separate notes, introductions, '
                                   'headings or paragraph layout. Inline source annotations, historical '
                                   'spellings and alternate-numbering text remain unchanged where present.',
                                   'Changed study material must be separately labeled and must not be '
                                   'presented as unchanged publisher text.',
                                   'No third-party recorded audio, cover artwork, illustrations, maps or '
                                   'distinct modern revisions are included or licensed by this text import.',
                                   'No provider certification badge or trademark license is included, and '
                                   'this application is not claimed to be provider-certified.'],
                    'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                           'https://ebible.org/publicdomain.htm'],
                    'preserveSourceNotice': True,
                    'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                         'registryFileDate': '2026-09-17',
                                         'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                         'languageTag': 'my',
                                         'script': 'Mymr',
                                         'direction': 'ltr',
                                         'sourceLetterBidiCounts': {'L': 1618063},
                                         'sourceLetterUnicodeNamePrefixes': {'MYANMAR': 1618063},
                                         'scope': 'Language identity is supplied by the individual publisher '
                                                  'notice. The IANA registry validates the selected '
                                                  'language/script subtags; direction and observed script '
                                                  'are checked against every source letter. No '
                                                  'native-language approval is asserted.'}},
 'nld-1917': {'name': 'De Heilige Schrift 1917',
              'nativeTitle': 'De Heilige Schrift 1917',
              'abbreviation': 'NLD1917',
              'language': 'nl',
              'script': 'Latn',
              'direction': 'ltr',
              'corpus': 'bible',
              'publisher': 'eBible.org',
              'translator': 'Not specified in the publisher notice.',
              'providerId': 'nld',
              'revision': '1917, as identified by the publisher notice; no further translation identity is '
                          'inferred.',
              'canon': 'protestant-66',
              'sourceUpdatedAt': '2025-12-12',
              'sourceNoticeDate': '2023-01-23',
              'rightsObservedAt': '2026-11-05',
              'sourceUrl': 'https://ebible.org/nld/',
              'formatUrl': 'https://ebible.org/find/details.php?id=nld',
              'downloadUrl': 'https://ebible.org/Scriptures/nld_vpl.zip',
              'downloadBytes': 4599195,
              'licenseUrl': 'https://ebible.org/nld/copyright.htm',
              'license': 'Public domain (provider-declared)',
              'licenseIdentifier': 'LicenseRef-Public-Domain',
              'attribution': 'De Heilige Schrift 1917. De Heilige Schrift 1917. Not specified in the '
                             'publisher notice.. 1917, as identified by the publisher notice; no further '
                             'translation identity is inferred. Public domain as declared by eBible.org; '
                             'exact source files dated 2025-12-12; full publisher notice retained.',
              'sha256': '1b725d623e86e639516b59cc9c292184066f2b2ca58df2e500f2878883dc3938',
              'xmlSha256': '9f8818342a7d306fd0fa86a555db6758235681f47aebbc9d105d365c8d341876',
              'textSha256': '93eda0e4813c02741810ec6c487857d14c2dd3be471dfe570f739acd53f5c686',
              'noticeSha256': '61605d44d18246ebedcb032bb64cdec1db237d0024edc99c447323bd9e82b48d',
              'bracketExceptionCount': 0,
              'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
              'bracketExceptionScope': '0 source records differ only at the exact pinned square-bracket '
                                       'positions. All display text remains the complete original TXT; no '
                                       'wording or numbering is repaired.',
              'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
              'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
              'conditions': ['Retain the exact edition identity, original source wording and complete '
                             'publisher notice with redistributed/offline copies.',
                             'Rights evidence is the individual provider declaration and stated provider '
                             'uses, not independent worldwide legal or human editorial approval; the '
                             'provider inventory describes public-domain knowledge in the USA and its policy '
                             'acknowledges national-law variation.',
                             'Publisher VPL supplies verse text without separate notes, introductions, '
                             'headings or paragraph layout. Inline source annotations, historical spellings '
                             'and alternate-numbering text remain unchanged where present.',
                             'Changed study material must be separately labeled and must not be presented as '
                             'unchanged publisher text.',
                             'No third-party recorded audio, cover artwork, illustrations, maps or distinct '
                             'modern revisions are included or licensed by this text import.',
                             'No provider certification badge or trademark license is included, and this '
                             'application is not claimed to be provider-certified.'],
              'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm'],
              'preserveSourceNotice': True,
              'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                   'registryFileDate': '2026-09-17',
                                   'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                   'languageTag': 'nl',
                                   'script': 'Latn',
                                   'direction': 'ltr',
                                   'sourceLetterBidiCounts': {'L': 3404856},
                                   'sourceLetterUnicodeNamePrefixes': {'LATIN': 3404856},
                                   'scope': 'Language identity is supplied by the individual publisher '
                                            'notice. The IANA registry validates the selected '
                                            'language/script subtags; direction and observed script are '
                                            'checked against every source letter. No native-language '
                                            'approval is asserted.'}},
 'haw-1868': {'name': 'Baibala Hemolele (1868)',
              'nativeTitle': 'Baibala Hemolele',
              'abbreviation': 'HAW1868',
              'language': 'haw',
              'script': 'Latn',
              'direction': 'ltr',
              'corpus': 'bible',
              'publisher': 'eBible.org',
              'translator': 'na na misionari i pai',
              'providerId': 'haw1868',
              'revision': '1868 revision, as identified by the publisher notice.',
              'canon': 'protestant-66',
              'sourceUpdatedAt': '2025-12-12',
              'sourceNoticeDate': '2015-11-10',
              'rightsObservedAt': '2026-11-05',
              'sourceUrl': 'https://ebible.org/haw1868/',
              'formatUrl': 'https://ebible.org/find/details.php?id=haw1868',
              'downloadUrl': 'https://ebible.org/Scriptures/haw1868_vpl.zip',
              'downloadBytes': 4189783,
              'licenseUrl': 'https://ebible.org/haw1868/copyright.htm',
              'license': 'Public domain (provider-declared)',
              'licenseIdentifier': 'LicenseRef-Public-Domain',
              'attribution': 'Baibala Hemolele (1868). Baibala Hemolele. na na misionari i pai. 1868 '
                             'revision, as identified by the publisher notice. Public domain as declared by '
                             'eBible.org; exact source files dated 2025-12-12; full publisher notice '
                             'retained.',
              'sha256': 'ed5a6d757d6532bc8a1cce2016c7ff53e7d9c9e0176c502261557e8de0fd85dc',
              'xmlSha256': '177538c15c9e5a7174558f5a4b844b1a466a46757669c762825725fcc6ac21b5',
              'textSha256': 'c0f7360a77f9714a490f930f7dff3566e7e40faa5830e249a43ccfbf6163ae1a',
              'noticeSha256': '22797584ace2a630ebc22ce432e2faf02070c123c97a18199013a11b8aedb796',
              'bracketExceptionCount': 39,
              'bracketExceptionInventorySha256': '907d4c42524ad0a78b4fb9bbabcd081c153881c57706214041ac1b95895a7d31',
              'bracketExceptionScope': '39 source records differ only at the exact pinned square-bracket '
                                       'positions. All display text remains the complete original TXT; no '
                                       'wording or numbering is repaired.',
              'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
              'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
              'conditions': ['Retain the exact edition identity, original source wording and complete '
                             'publisher notice with redistributed/offline copies.',
                             'Rights evidence is the individual provider declaration and stated provider '
                             'uses, not independent worldwide legal or human editorial approval; the '
                             'provider inventory describes public-domain knowledge in the USA and its policy '
                             'acknowledges national-law variation.',
                             'Publisher VPL supplies verse text without separate notes, introductions, '
                             'headings or paragraph layout. Inline source annotations, historical spellings '
                             'and alternate-numbering text remain unchanged where present.',
                             'Changed study material must be separately labeled and must not be presented as '
                             'unchanged publisher text.',
                             'No third-party recorded audio, cover artwork, illustrations, maps or distinct '
                             'modern revisions are included or licensed by this text import.',
                             'No provider certification badge or trademark license is included, and this '
                             'application is not claimed to be provider-certified.'],
              'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm'],
              'preserveSourceNotice': True,
              'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                   'registryFileDate': '2026-09-17',
                                   'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                   'languageTag': 'haw',
                                   'script': 'Latn',
                                   'direction': 'ltr',
                                   'sourceLetterBidiCounts': {'L': 3247208},
                                   'sourceLetterUnicodeNamePrefixes': {'LATIN': 3247208},
                                   'scope': 'Language identity is supplied by the individual publisher '
                                            'notice. The IANA registry validates the selected '
                                            'language/script subtags; direction and observed script are '
                                            'checked against every source letter. No native-language '
                                            'approval is asserted.'}},
 'rus-synodal': {'name': 'Russian Synodal Bible',
                 'nativeTitle': 'Синодальный перевод',
                 'abbreviation': 'SYN',
                 'language': 'ru',
                 'script': 'Cyrl',
                 'direction': 'ltr',
                 'corpus': 'bible',
                 'publisher': 'eBible.org',
                 'translator': 'Not specified in the publisher notice.',
                 'providerId': 'russyn',
                 'revision': 'Synodal translation; no historical revision year is specified in the '
                             'individual notice.',
                 'canon': 'protestant-66',
                 'sourceUpdatedAt': '2025-12-12',
                 'sourceNoticeDate': '2022-11-25',
                 'rightsObservedAt': '2026-11-05',
                 'sourceUrl': 'https://ebible.org/russyn/',
                 'formatUrl': 'https://ebible.org/find/details.php?id=russyn',
                 'downloadUrl': 'https://ebible.org/Scriptures/russyn_vpl.zip',
                 'downloadBytes': 5066001,
                 'licenseUrl': 'https://ebible.org/russyn/copyright.htm',
                 'license': 'Public domain (provider-declared)',
                 'licenseIdentifier': 'LicenseRef-Public-Domain',
                 'attribution': 'Russian Synodal Bible. Синодальный перевод. Not specified in the publisher '
                                'notice.. Synodal translation; no historical revision year is specified in '
                                'the individual notice. Public domain as declared by eBible.org; exact '
                                'source files dated 2025-12-12; full publisher notice retained.',
                 'sha256': 'e8f12f3f3e5856a859034ac5614a8a67d112c7afa59c2af9f42be46e45d68198',
                 'xmlSha256': '3b653989956d1d88b491894c6fa66f924c960757121eddd43440ef70465a3b6c',
                 'textSha256': '40b3e2c17769439b4743f94c0cf7ec18c02dbc68a6967c5bf096874fbee6a872',
                 'noticeSha256': '6288ef9de366517db3dc1b46af55e1f5688f13f6440ab78d23e7044d185ac8e9',
                 'bracketExceptionCount': 0,
                 'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                 'bracketExceptionScope': '0 source records differ only at the exact pinned square-bracket '
                                          'positions. All display text remains the complete original TXT; no '
                                          'wording or numbering is repaired.',
                 'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31169},
                 'rights': {'redistribute': True,
                            'adapt': True,
                            'offline': True,
                            'audio': True,
                            'export': True},
                 'conditions': ['Retain the exact edition identity, original source wording and complete '
                                'publisher notice with redistributed/offline copies.',
                                'Rights evidence is the individual provider declaration and stated provider '
                                'uses, not independent worldwide legal or human editorial approval; the '
                                'provider inventory describes public-domain knowledge in the USA and its '
                                'policy acknowledges national-law variation.',
                                'Publisher VPL supplies verse text without separate notes, introductions, '
                                'headings or paragraph layout. Inline source annotations, historical '
                                'spellings and alternate-numbering text remain unchanged where present.',
                                'Changed study material must be separately labeled and must not be presented '
                                'as unchanged publisher text.',
                                'No third-party recorded audio, cover artwork, illustrations, maps or '
                                'distinct modern revisions are included or licensed by this text import.',
                                'No provider certification badge or trademark license is included, and this '
                                'application is not claimed to be provider-certified.'],
                 'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                        'https://ebible.org/publicdomain.htm'],
                 'preserveSourceNotice': True,
                 'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                      'registryFileDate': '2026-09-17',
                                      'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                      'languageTag': 'ru',
                                      'script': 'Cyrl',
                                      'direction': 'ltr',
                                      'sourceLetterBidiCounts': {'L': 2683506},
                                      'sourceLetterUnicodeNamePrefixes': {'CYRILLIC': 2683479, 'LATIN': 27},
                                      'scope': 'Language identity is supplied by the individual publisher '
                                               'notice. The IANA registry validates the selected '
                                               'language/script subtags; direction and observed script are '
                                               'checked against every source letter. No native-language '
                                               'approval is asserted.'}},
 'ukr-kulish1905': {'name': 'Ukrainian Kulish–Puluj Bible (1905)',
                    'nativeTitle': 'Біблія в пер. П.Куліша та І.Пулюя, 1905',
                    'abbreviation': 'KUL1905',
                    'language': 'uk',
                    'script': 'Cyrl',
                    'direction': 'ltr',
                    'corpus': 'bible',
                    'publisher': 'eBible.org',
                    'translator': 'Panteleimon Kulish; contributors: Ivan Semenovych Nechui-Levytsky and '
                                  'Ivan Pavlovych Puluj',
                    'providerId': 'ukr1871',
                    'revision': '1905 in the publisher title and notice; ukr1871 is retained only as the '
                                'provider identifier.',
                    'canon': 'protestant-66',
                    'sourceUpdatedAt': '2026-09-02',
                    'sourceNoticeDate': '2025-01-31',
                    'rightsObservedAt': '2026-11-05',
                    'sourceUrl': 'https://ebible.org/ukr1871/',
                    'formatUrl': 'https://ebible.org/find/details.php?id=ukr1871',
                    'downloadUrl': 'https://ebible.org/Scriptures/ukr1871_vpl.zip',
                    'downloadBytes': 5310199,
                    'licenseUrl': 'https://ebible.org/ukr1871/copyright.htm',
                    'license': 'Public domain (provider-declared)',
                    'licenseIdentifier': 'LicenseRef-Public-Domain',
                    'attribution': 'Ukrainian Kulish–Puluj Bible (1905). Біблія в пер. П.Куліша та І.Пулюя, '
                                   '1905. Panteleimon Kulish; contributors: Ivan Semenovych Nechui-Levytsky '
                                   'and Ivan Pavlovych Puluj. 1905 in the publisher title and notice; '
                                   'ukr1871 is retained only as the provider identifier. Public domain as '
                                   'declared by eBible.org; exact source files dated 2026-09-02; full '
                                   'publisher notice retained.',
                    'sha256': 'd1913e04db9f4e2fc3405a98e40a9358ef332ac9b463d0d2e8aeb0b6b90d7014',
                    'xmlSha256': '32e52721ee4034e08b66fe6e080cbbaf40e7c2e0a4a8f6bbcb2a6c5a860000eb',
                    'textSha256': '1d2230822492a230c04fbea34f1b5ede7073a9d19c23a461d9738c87b85c2ec1',
                    'noticeSha256': '1b091a037aea5ce324683798c575624d4cc4d4928b79fa4a5024db35916513eb',
                    'bracketExceptionCount': 2,
                    'bracketExceptionInventorySha256': '0a25e9c305da70604094bafefd8011e2e9edd6bf4fb2b62cf4b61853f9d6db14',
                    'bracketExceptionScope': '2 source records differ only at the exact pinned '
                                             'square-bracket positions. All display text remains the '
                                             'complete original TXT; no wording or numbering is repaired.',
                    'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31082},
                    'rights': {'redistribute': True,
                               'adapt': True,
                               'offline': True,
                               'audio': True,
                               'export': True},
                    'conditions': ['Retain the exact edition identity, original source wording and complete '
                                   'publisher notice with redistributed/offline copies.',
                                   'Rights evidence is the individual provider declaration and stated '
                                   'provider uses, not independent worldwide legal or human editorial '
                                   'approval; the provider inventory describes public-domain knowledge in '
                                   'the USA and its policy acknowledges national-law variation.',
                                   'Publisher VPL supplies verse text without separate notes, introductions, '
                                   'headings or paragraph layout. Inline source annotations, historical '
                                   'spellings and alternate-numbering text remain unchanged where present.',
                                   'Changed study material must be separately labeled and must not be '
                                   'presented as unchanged publisher text.',
                                   'No third-party recorded audio, cover artwork, illustrations, maps or '
                                   'distinct modern revisions are included or licensed by this text import.',
                                   'No provider certification badge or trademark license is included, and '
                                   'this application is not claimed to be provider-certified.'],
                    'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                           'https://ebible.org/publicdomain.htm'],
                    'preserveSourceNotice': True,
                    'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                         'registryFileDate': '2026-09-17',
                                         'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                         'languageTag': 'uk',
                                         'script': 'Cyrl',
                                         'direction': 'ltr',
                                         'sourceLetterBidiCounts': {'L': 2649600},
                                         'sourceLetterUnicodeNamePrefixes': {'CYRILLIC': 2649282,
                                                                             'MODIFIER': 318},
                                         'scope': 'Language identity is supplied by the individual publisher '
                                                  'notice. The IANA registry validates the selected '
                                                  'language/script subtags; direction and observed script '
                                                  'are checked against every source letter. No '
                                                  'native-language approval is asserted.'}},
 'vie-cadman': {'name': 'Vietnamese Bible (NT 1923 / OT 1925)',
                'nativeTitle': 'Kinh Thánh',
                'abbreviation': 'VCAD',
                'language': 'vi',
                'script': 'Latn',
                'direction': 'ltr',
                'corpus': 'bible',
                'publisher': 'eBible.org',
                'translator': 'William Cadman (1883–1948); contributor: Christian and Missionary Alliance',
                'providerId': 'vie1934',
                'revision': 'New Testament first published 1923; Old Testament first published 1925. The '
                            'provider ID vie1934 does not establish a 1934 revision.',
                'canon': 'protestant-66',
                'sourceUpdatedAt': '2025-12-12',
                'sourceNoticeDate': '2022-06-09',
                'rightsObservedAt': '2026-11-05',
                'sourceUrl': 'https://ebible.org/vie1934/',
                'formatUrl': 'https://ebible.org/find/details.php?id=vie1934',
                'downloadUrl': 'https://ebible.org/Scriptures/vie1934_vpl.zip',
                'downloadBytes': 4692647,
                'licenseUrl': 'https://ebible.org/vie1934/copyright.htm',
                'license': 'Public domain (provider-declared)',
                'licenseIdentifier': 'LicenseRef-Public-Domain',
                'attribution': 'Vietnamese Bible (NT 1923 / OT 1925). Kinh Thánh. William Cadman '
                               '(1883–1948); contributor: Christian and Missionary Alliance. New Testament '
                               'first published 1923; Old Testament first published 1925. The provider ID '
                               'vie1934 does not establish a 1934 revision. Public domain as declared by '
                               'eBible.org; exact source files dated 2025-12-12; full publisher notice '
                               'retained.',
                'sha256': '54a1c70f875ac5c4315259665d7e1ad153b3b90f28a3a868db9cbd4c56e6e1d0',
                'xmlSha256': '92f55f4ba3b4baecafdc33eed87995946e06e5901cef5533104b405e599472fd',
                'textSha256': 'f8433c875bb670628a1f0b9cc548237f033c9320170731f3be1b38482e45705f',
                'noticeSha256': '5e1f459b904964cc7ed77c445f8d5ef884007bd7713c79c29a6765929bc322df',
                'bracketExceptionCount': 0,
                'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                'bracketExceptionScope': '0 source records differ only at the exact pinned square-bracket '
                                         'positions. All display text remains the complete original TXT; no '
                                         'wording or numbering is repaired.',
                'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
                'rights': {'redistribute': True,
                           'adapt': True,
                           'offline': True,
                           'audio': True,
                           'export': True},
                'conditions': ['Retain the exact edition identity, original source wording and complete '
                               'publisher notice with redistributed/offline copies.',
                               'Rights evidence is the individual provider declaration and stated provider '
                               'uses, not independent worldwide legal or human editorial approval; the '
                               'provider inventory describes public-domain knowledge in the USA and its '
                               'policy acknowledges national-law variation.',
                               'Publisher VPL supplies verse text without separate notes, introductions, '
                               'headings or paragraph layout. Inline source annotations, historical '
                               'spellings and alternate-numbering text remain unchanged where present.',
                               'Changed study material must be separately labeled and must not be presented '
                               'as unchanged publisher text.',
                               'No third-party recorded audio, cover artwork, illustrations, maps or '
                               'distinct modern revisions are included or licensed by this text import.',
                               'No provider certification badge or trademark license is included, and this '
                               'application is not claimed to be provider-certified.',
                               'The notice asserts NT public-domain entry on 2019-01-01 and OT on '
                               '2021-01-01. These are retained as publisher statements, not an independent '
                               'worldwide copyright conclusion.'],
                'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm'],
                'preserveSourceNotice': True,
                'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                     'registryFileDate': '2026-09-17',
                                     'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                     'languageTag': 'vi',
                                     'script': 'Latn',
                                     'direction': 'ltr',
                                     'sourceLetterBidiCounts': {'L': 2855037},
                                     'sourceLetterUnicodeNamePrefixes': {'LATIN': 2855037},
                                     'scope': 'Language identity is supplied by the individual publisher '
                                              'notice. The IANA registry validates the selected '
                                              'language/script subtags; direction and observed script are '
                                              'checked against every source letter. No native-language '
                                              'approval is asserted.'}},
 'srp-danicic-karadzic': {'name': 'Serbian Daničić–Karadžić Bible (Cyrillic)',
                          'nativeTitle': 'Свето писмо или Библија Превод Даничић-Караџић',
                          'abbreviation': 'DKCYR',
                          'language': 'sr-Cyrl',
                          'script': 'Cyrl',
                          'direction': 'ltr',
                          'corpus': 'bible',
                          'publisher': 'eBible.org',
                          'translator': 'Daničić–Karadžić, as named by the publisher',
                          'providerId': 'srp1868',
                          'revision': 'Daničić–Karadžić translation, Cyrillic alphabet; no historical '
                                      'revision year is specified in the individual notice.',
                          'canon': 'protestant-66',
                          'sourceUpdatedAt': '2026-01-03',
                          'sourceNoticeDate': '2026-01-03',
                          'rightsObservedAt': '2026-11-05',
                          'sourceUrl': 'https://ebible.org/srp1868/',
                          'formatUrl': 'https://ebible.org/find/details.php?id=srp1868',
                          'downloadUrl': 'https://ebible.org/Scriptures/srp1868_vpl.zip',
                          'downloadBytes': 4709500,
                          'licenseUrl': 'https://ebible.org/srp1868/copyright.htm',
                          'license': 'Public domain (provider-declared)',
                          'licenseIdentifier': 'LicenseRef-Public-Domain',
                          'attribution': 'Serbian Daničić–Karadžić Bible (Cyrillic). Свето писмо или Библија '
                                         'Превод Даничић-Караџић. Daničić–Karadžić, as named by the '
                                         'publisher. Daničić–Karadžić translation, Cyrillic alphabet; no '
                                         'historical revision year is specified in the individual notice. '
                                         'Public domain as declared by eBible.org; exact source files dated '
                                         '2026-01-03; full publisher notice retained.',
                          'sha256': '40f38bfe0af0a6df4f31d2873cc76902caf576b3f54217d2c86adee6d57e196b',
                          'xmlSha256': '1ac75c19205e086a24260dd9050e7fe69ece31df7762012231a435fa3a59fd5a',
                          'textSha256': '8c6180092f703d9032c75cc6e4b36b55573d6383a9abdf4b1065f1401763594e',
                          'noticeSha256': '62693985619a1380c66f1506d899f89bb62a6ebf705df778e140821e1556841e',
                          'bracketExceptionCount': 0,
                          'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                          'bracketExceptionScope': '0 source records differ only at the exact pinned '
                                                   'square-bracket positions. All display text remains the '
                                                   'complete original TXT; no wording or numbering is '
                                                   'repaired.',
                          'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31111},
                          'rights': {'redistribute': True,
                                     'adapt': True,
                                     'offline': True,
                                     'audio': True,
                                     'export': True},
                          'conditions': ['Retain the exact edition identity, original source wording and '
                                         'complete publisher notice with redistributed/offline copies.',
                                         'Rights evidence is the individual provider declaration and stated '
                                         'provider uses, not independent worldwide legal or human editorial '
                                         'approval; the provider inventory describes public-domain knowledge '
                                         'in the USA and its policy acknowledges national-law variation.',
                                         'Publisher VPL supplies verse text without separate notes, '
                                         'introductions, headings or paragraph layout. Inline source '
                                         'annotations, historical spellings and alternate-numbering text '
                                         'remain unchanged where present.',
                                         'Changed study material must be separately labeled and must not be '
                                         'presented as unchanged publisher text.',
                                         'No third-party recorded audio, cover artwork, illustrations, maps '
                                         'or distinct modern revisions are included or licensed by this text '
                                         'import.',
                                         'No provider certification badge or trademark license is included, '
                                         'and this application is not claimed to be provider-certified.'],
                          'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                                 'https://ebible.org/publicdomain.htm'],
                          'preserveSourceNotice': True,
                          'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                               'registryFileDate': '2026-09-17',
                                               'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                               'languageTag': 'sr-Cyrl',
                                               'script': 'Cyrl',
                                               'direction': 'ltr',
                                               'sourceLetterBidiCounts': {'L': 2473630},
                                               'sourceLetterUnicodeNamePrefixes': {'CYRILLIC': 2473630},
                                               'scope': 'Language identity is supplied by the individual '
                                                        'publisher notice. The IANA registry validates the '
                                                        'selected language/script subtags; direction and '
                                                        'observed script are checked against every source '
                                                        'letter. No native-language approval is asserted.'}},
 'ton-revised-west': {'name': 'Tongan Revised West Version',
                      'nativeTitle': 'KO E TOHI TAPU KĀTOA',
                      'abbreviation': 'RWV',
                      'language': 'to',
                      'script': 'Latn',
                      'direction': 'ltr',
                      'corpus': 'bible',
                      'publisher': 'eBible.org',
                      'translator': 'James Baxley; digital editions/layout credit: Michael Johnson',
                      'providerId': 'ton',
                      'revision': 'Revised West Version; exact provider source dated 2025-12-12. Not an '
                                  'untouched nineteenth-century West edition.',
                      'canon': 'protestant-66',
                      'sourceUpdatedAt': '2025-12-12',
                      'sourceNoticeDate': '2025-10-25',
                      'rightsObservedAt': '2026-11-05',
                      'sourceUrl': 'https://ebible.org/ton/',
                      'formatUrl': 'https://ebible.org/find/details.php?id=ton',
                      'downloadUrl': 'https://ebible.org/Scriptures/ton_vpl.zip',
                      'downloadBytes': 4406673,
                      'licenseUrl': 'https://ebible.org/ton/copyright.htm',
                      'license': 'Public domain (provider-declared)',
                      'licenseIdentifier': 'LicenseRef-Public-Domain',
                      'attribution': 'Tongan Revised West Version. KO E TOHI TAPU KĀTOA. James Baxley; '
                                     'digital editions/layout credit: Michael Johnson. Revised West Version; '
                                     'exact provider source dated 2025-12-12. Not an untouched '
                                     'nineteenth-century West edition. Public domain as declared by '
                                     'eBible.org; exact source files dated 2025-12-12; full publisher notice '
                                     'retained.',
                      'sha256': '24cea17bdf324d7f59ea40367e6340a3b52f8d0157dcd68c6dc55df3302bb5fb',
                      'xmlSha256': 'a7b3537755b4f6848ad04d99dd18bf0954f2c6b9989e9392a79ddeea4ad25405',
                      'textSha256': 'bd6b91a6f39a692afe9f56d2d29177b897bcac818eaf89abe33adf2743a32c11',
                      'noticeSha256': '6bfce522d0ed0e29a2e7a69ce94cdadf351ae2c0720a3a7f06b41ada2218802e',
                      'bracketExceptionCount': 1238,
                      'bracketExceptionInventorySha256': 'e0c67d2f53444c5934bf3efdfd04ef62a1fd260a1bd82223be1fa321852d37d7',
                      'bracketExceptionScope': '1238 source records differ only at the exact pinned '
                                               'square-bracket positions and one separately pinned ASCII '
                                               'padding position at Mark 13:3. All display text remains the '
                                               'complete original TXT; no wording or numbering is repaired.',
                      'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
                      'rights': {'redistribute': True,
                                 'adapt': True,
                                 'offline': True,
                                 'audio': True,
                                 'export': True},
                      'conditions': ['Retain the exact edition identity, original source wording and '
                                     'complete publisher notice with redistributed/offline copies.',
                                     'Rights evidence is the individual provider declaration and stated '
                                     'provider uses, not independent worldwide legal or human editorial '
                                     'approval; the provider inventory describes public-domain knowledge in '
                                     'the USA and its policy acknowledges national-law variation.',
                                     'Publisher VPL supplies verse text without separate notes, '
                                     'introductions, headings or paragraph layout. Inline source '
                                     'annotations, historical spellings and alternate-numbering text remain '
                                     'unchanged where present.',
                                     'Changed study material must be separately labeled and must not be '
                                     'presented as unchanged publisher text.',
                                     'No third-party recorded audio, cover artwork, illustrations, maps or '
                                     'distinct modern revisions are included or licensed by this text '
                                     'import.',
                                     'No provider certification badge or trademark license is included, and '
                                     'this application is not claimed to be provider-certified.',
                                     'The source credits cover/title-page artist Kitione Vailea and digital '
                                     'layout by Michael Johnson; cover art and layout are not imported. The '
                                     'provider explicitly lists Revised West among translations dedicated to '
                                     'the public domain.'],
                      'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                             'https://ebible.org/publicdomain.htm'],
                      'preserveSourceNotice': True,
                      'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                           'registryFileDate': '2026-09-17',
                                           'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                           'languageTag': 'to',
                                           'script': 'Latn',
                                           'direction': 'ltr',
                                           'sourceLetterBidiCounts': {'L': 3737910},
                                           'sourceLetterUnicodeNamePrefixes': {'LATIN': 3409561,
                                                                               'MODIFIER': 328349},
                                           'scope': 'Language identity is supplied by the individual '
                                                    'publisher notice. The IANA registry validates the '
                                                    'selected language/script subtags; direction and '
                                                    'observed script are checked against every source '
                                                    'letter. No native-language approval is asserted.'},
                      'bracketPaddingExceptions': [{'bookId': 'MRK',
                                                    'chapter': 13,
                                                    'verse': 3,
                                                    'xmlTextSha256': '9b87e6744f40bb888669b14652338b99828f55e82fa7cc36d8b67d25674100af',
                                                    'textSha256': '1b02ae8342254c34bab5dfccfacaaddeddc0bac665a0a4e9e70287bac530915c',
                                                    'paddingPositions': [{'offset': 158, 'character': ' '}]}],
                      'formatEvidence': {'sourceUrl': 'https://ebible.org/Scriptures/ton_usfm.zip',
                                         'archiveBytes': 1545882,
                                         'archiveSha256': 'd217d40dd70eafcd31c6531dd5bc9ea08c84e66d57164977cc1fb822d3af1d6d',
                                         'member': '71-MRKton.usfm',
                                         'memberSha256': '93ab55a0188882ec870dc996d8466994c0920cad896ea8850cc64c91a84e6cbb',
                                         'reference': {'bookId': 'MRK', 'chapter': 13, 'verse': 3},
                                         'sourceExcerpt': 'Pea ʻi heʻene nofo ʻi he moʻunga ʻoe ʻOlive, ʻo '
                                                          'hangatonu ki he falelotu lahi, naʻe fehuʻi '
                                                          'fakafufū kiate ia ʻa Pita mo Semisi mo Sione mo '
                                                          'ʻAnitelū, \\add ʻo pehē! \\add*  \n',
                                         'explanation': 'The official USFM at Mark 13:3 marks the same '
                                                        'phrase with \\add and includes one space before '
                                                        '\\add*. Its VPL TXT encloses that phrase in square '
                                                        'brackets and retains the space before ]. The '
                                                        'comparison removes only the separately pinned '
                                                        'brackets and that one exact ASCII space; display '
                                                        'text remains the original TXT.'}},
 'eng-geneva1599': {'name': 'Geneva Bible 1599',
                    'nativeTitle': 'Geneva Bible 1599',
                    'abbreviation': 'GNV1599',
                    'language': 'en',
                    'script': 'Latn',
                    'direction': 'ltr',
                    'corpus': 'bible',
                    'publisher': 'eBible.org',
                    'translator': 'Not specified in the publisher notice.',
                    'providerId': 'enggnv',
                    'revision': '1599; original historical English spelling, as identified by the publisher '
                                'notice.',
                    'canon': 'protestant-66',
                    'sourceUpdatedAt': '2025-12-12',
                    'sourceNoticeDate': '2024-03-16',
                    'rightsObservedAt': '2026-11-05',
                    'sourceUrl': 'https://ebible.org/enggnv/',
                    'formatUrl': 'https://ebible.org/find/details.php?id=enggnv',
                    'downloadUrl': 'https://ebible.org/Scriptures/enggnv_vpl.zip',
                    'downloadBytes': 4402877,
                    'licenseUrl': 'https://ebible.org/enggnv/copyright.htm',
                    'license': 'Public domain (provider-declared)',
                    'licenseIdentifier': 'LicenseRef-Public-Domain',
                    'attribution': 'Geneva Bible 1599. Geneva Bible 1599. Not specified in the publisher '
                                   'notice.. 1599; original historical English spelling, as identified by '
                                   'the publisher notice. Public domain as declared by eBible.org; exact '
                                   'source files dated 2025-12-12; full publisher notice retained.',
                    'sha256': 'faa35b12d04bdacda78b5b53b35bc241d576c63e5d6cd5bccd99bb337b8f7ade',
                    'xmlSha256': '0c6ab214c47ff70c25f872798bcf96b3c2d23e468161bedeb9a7c52bc126e5ea',
                    'textSha256': '85b72aa8e565b8283a85237cfa58148f3a4f34a6c22bc3d61cd2a07104d65ab8',
                    'noticeSha256': 'b62c096ea6d271b310bb8aa5966d1fc274fe63c7ea6a8e9a8a9f8cf68ac5d946',
                    'bracketExceptionCount': 0,
                    'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                    'bracketExceptionScope': '0 source records differ only at the exact pinned '
                                             'square-bracket positions. All display text remains the '
                                             'complete original TXT; no wording or numbering is repaired.',
                    'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31090},
                    'rights': {'redistribute': True,
                               'adapt': True,
                               'offline': True,
                               'audio': True,
                               'export': True},
                    'conditions': ['Retain the exact edition identity, original source wording and complete '
                                   'publisher notice with redistributed/offline copies.',
                                   'Rights evidence is the individual provider declaration and stated '
                                   'provider uses, not independent worldwide legal or human editorial '
                                   'approval; the provider inventory describes public-domain knowledge in '
                                   'the USA and its policy acknowledges national-law variation.',
                                   'Publisher VPL supplies verse text without separate notes, introductions, '
                                   'headings or paragraph layout. Inline source annotations, historical '
                                   'spellings and alternate-numbering text remain unchanged where present.',
                                   'Changed study material must be separately labeled and must not be '
                                   'presented as unchanged publisher text.',
                                   'No third-party recorded audio, cover artwork, illustrations, maps or '
                                   'distinct modern revisions are included or licensed by this text import.',
                                   'No provider certification badge or trademark license is included, and '
                                   'this application is not claimed to be provider-certified.',
                                   'The individual notice expressly permits this digital copy worldwide '
                                   'without copyright restrictions. Preserve its historical English '
                                   'spelling; the notice uses the dialect label Old, which is not relabeled '
                                   'as the distinct Old English language code ang.'],
                    'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                           'https://ebible.org/publicdomain.htm'],
                    'preserveSourceNotice': True,
                    'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                         'registryFileDate': '2026-09-17',
                                         'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                         'languageTag': 'en',
                                         'script': 'Latn',
                                         'direction': 'ltr',
                                         'sourceLetterBidiCounts': {'L': 3276328},
                                         'sourceLetterUnicodeNamePrefixes': {'LATIN': 3276328},
                                         'scope': 'Language identity is supplied by the individual publisher '
                                                  'notice. The IANA registry validates the selected '
                                                  'language/script subtags; direction and observed script '
                                                  'are checked against every source letter. No '
                                                  'native-language approval is asserted.'}}})


# Next complete-edition batch: exact primary sources reviewed 2026-11-05.
SOURCES.update({'fra-darby2024': {'name': 'Bible J.N. Darby (BPC 2024, v2.0)',
                   'nativeTitle': 'Bible J.N. Darby',
                   'abbreviation': 'JND24',
                   'language': 'fr',
                   'publisher': 'Bibles et Publications Chrétiennes; distributed by eBible.org',
                   'translator': 'J. N. Darby; BPC JND revision 2.0',
                   'revision': 'BPC JND v2.0, 2024 reissue; source files dated 2025-05-02. Not the distinct '
                               '2026 revised edition.',
                   'sourceUpdatedAt': '2025-05-02',
                   'sourceNoticeDate': '2025-05-02',
                   'publicationStatus': 'published-edition',
                   'script': 'Latn',
                   'direction': 'ltr',
                   'corpus': 'bible',
                   'providerId': 'frajnd',
                   'canon': 'protestant-66',
                   'rightsObservedAt': '2026-11-05',
                   'sourceUrl': 'https://ebible.org/frajnd/',
                   'formatUrl': 'https://ebible.org/find/details.php?id=frajnd',
                   'downloadUrl': 'https://ebible.org/Scriptures/frajnd_vpl.zip',
                   'downloadBytes': 4619813,
                   'licenseUrl': 'https://ebible.org/frajnd/copyright.htm',
                   'license': 'Public domain (provider-declared)',
                   'licenseIdentifier': 'LicenseRef-Public-Domain',
                   'attribution': 'Bible J.N. Darby (BPC 2024, v2.0). J. N. Darby; BPC JND revision 2.0 BPC '
                                  'JND v2.0, 2024 reissue; source files dated 2025-05-02. Not the distinct '
                                  '2026 revised edition. Public domain as declared by the source publisher; '
                                  'unchanged VPL text; complete source notice retained.',
                   'sha256': 'dbda2c381fd0cbf2bf0f65dac2052db6f728908a8b50a7518fd5ba8c9711dc60',
                   'xmlSha256': '304906002e8a6ade7d424faf18d13cc97e407618cba6fa030db8047ea8c559c4',
                   'textSha256': 'f6c6a62eb55c51270a02123d3a0464ed6c101621a1f56adc221abd347c0dc8ef',
                   'noticeSha256': '24d271aef4497681b968daa2ef1fbe7e77c85f566f9a868f622f722aae9553f7',
                   'bracketExceptionCount': 4030,
                   'bracketExceptionInventorySha256': '777995e9a348c66b7362725b86c4863f7dd396eda4bdd41a95b6b89d4caeb7b9',
                   'bracketExceptionScope': '4030 source records differ only at the exact pinned '
                                            'square-bracket positions. Authoritative TXT display is '
                                            'unchanged; no wording or source numbering is repaired.',
                   'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31170},
                   'rights': {'redistribute': True,
                              'adapt': True,
                              'offline': True,
                              'audio': True,
                              'export': True},
                   'conditions': ['Retain the exact edition/revision identity, original source wording and '
                                  'complete publisher notice with redistributed and offline copies.',
                                  'Publisher VPL supplies verse text without separate notes, introductions, '
                                  'headings or paragraph layout. Source numbering, empty source records, '
                                  'inline characters and Unicode remain unchanged; no missing verse text is '
                                  'fabricated.',
                                  'No third-party recorded audio, cover artwork, illustrations, maps or '
                                  'distinct modern revisions are included or licensed by this text import.',
                                  'No provider certification badge, trademark endorsement or independent '
                                  'human editorial or native-language approval is asserted.',
                                  'Rights evidence is the individual provider declaration and stated '
                                  'provider uses, not independent worldwide legal or human editorial '
                                  'approval; the provider inventory qualifies its public-domain knowledge in '
                                  'the USA and applicable national law may vary.',
                                  'The publisher identifies this 2024 edition, revision 2.0, as public '
                                  'domain. The distinct 2026 revised edition is CC BY-NC-ND and is not '
                                  'imported. Separate Strong-number annotations are not imported.',
                                  'This edition follows source Hebrew-based numbering, including Joel 4 '
                                  'chapters and Malachi 3; do not remap it to another edition.'],
                   'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                          'https://ebible.org/publicdomain.htm',
                                          'https://editeurbpc.com/telechargements',
                                          'https://ftp.editeurbpc.com/telechargements/JND'],
                   'preserveSourceNotice': True,
                   'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                        'registryFileDate': '2026-09-17',
                                        'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                        'languageTag': 'fr',
                                        'script': 'Latn',
                                        'direction': 'ltr',
                                        'sourceLetterBidiCounts': {'L': 3241350},
                                        'sourceLetterUnicodeNamePrefixes': {'LATIN': 3241350},
                                        'scope': 'Language identity is supplied by the individual publisher '
                                                 'notice; IANA validates the selected language/region/script '
                                                 'subtags. All source letters were inspected. Embedded '
                                                 'Hebrew letters in Tandroy remain exact. This is not '
                                                 'native-language approval.'}},
 'spa-simple2026': {'name': 'La Biblia en Español Sencillo 2026',
                    'nativeTitle': 'La Biblia en Español Sencillo 2026',
                    'abbreviation': 'BES26',
                    'language': 'es-419',
                    'publisher': 'AudioBiblia.org; distributed by eBible.org',
                    'translator': 'Irma Flores; AudioBiblia.org',
                    'revision': 'Second edition 2026; translated and edited by Irma Flores; source files '
                                'dated 2026-10-30.',
                    'sourceUpdatedAt': '2026-10-30',
                    'sourceNoticeDate': '2026-10-30',
                    'publicationStatus': 'published-edition',
                    'script': 'Latn',
                    'direction': 'ltr',
                    'corpus': 'bible',
                    'providerId': 'spabes',
                    'canon': 'protestant-66',
                    'rightsObservedAt': '2026-11-05',
                    'sourceUrl': 'https://ebible.org/spabes/',
                    'formatUrl': 'https://ebible.org/find/details.php?id=spabes',
                    'downloadUrl': 'https://ebible.org/Scriptures/spabes_vpl.zip',
                    'downloadBytes': 4189235,
                    'licenseUrl': 'https://ebible.org/spabes/copyright.htm',
                    'license': 'Public domain (provider-declared)',
                    'licenseIdentifier': 'LicenseRef-Public-Domain',
                    'attribution': 'La Biblia en Español Sencillo 2026. Irma Flores; AudioBiblia.org Second '
                                   'edition 2026; translated and edited by Irma Flores; source files dated '
                                   '2026-10-30. Public domain as declared by the source publisher; unchanged '
                                   'VPL text; complete source notice retained.',
                    'sha256': 'b5397717e5031db82ce6c595ae1d3803626aaa3d11ce8750b31d5d766b3568e1',
                    'xmlSha256': '338919f40957f89859f145176effb9a430be0696ec3c1a58dd41ad0d82f5a0ce',
                    'textSha256': 'bf8b20be57783c1668a26cf1677e456599b6a3cde69b4908df35471bc30aae46',
                    'noticeSha256': 'db4e0fd74f2437906057a3ab26256eb9a59d12c5910b4a5ba6ec8b1f620bcf0e',
                    'bracketExceptionCount': 0,
                    'bracketExceptionInventorySha256': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
                    'bracketExceptionScope': '0 source records differ only at the exact pinned '
                                             'square-bracket positions. Authoritative TXT display is '
                                             'unchanged; no wording or source numbering is repaired.',
                    'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31102},
                    'rights': {'redistribute': True,
                               'adapt': True,
                               'offline': True,
                               'audio': True,
                               'export': True},
                    'conditions': ['Retain the exact edition/revision identity, original source wording and '
                                   'complete publisher notice with redistributed and offline copies.',
                                   'Publisher VPL supplies verse text without separate notes, introductions, '
                                   'headings or paragraph layout. Source numbering, empty source records, '
                                   'inline characters and Unicode remain unchanged; no missing verse text is '
                                   'fabricated.',
                                   'No third-party recorded audio, cover artwork, illustrations, maps or '
                                   'distinct modern revisions are included or licensed by this text import.',
                                   'No provider certification badge, trademark endorsement or independent '
                                   'human editorial or native-language approval is asserted.',
                                   'Rights evidence is the individual provider declaration and stated '
                                   'provider uses, not independent worldwide legal or human editorial '
                                   'approval; the provider inventory qualifies its public-domain knowledge '
                                   'in the USA and applicable national law may vary.',
                                   'The source identifies the dialect as Latin America/Mexico; es-419 '
                                   'records that regional Spanish identity. Text permission is separate from '
                                   'AudioBiblia recordings.'],
                    'rightsEvidenceUrls': ['https://ebible.org/legal.php',
                                           'https://ebible.org/publicdomain.htm',
                                           'https://audiobiblia.org/spabes_ab/spabes.htm'],
                    'preserveSourceNotice': True,
                    'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                         'registryFileDate': '2026-09-17',
                                         'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                         'languageTag': 'es-419',
                                         'script': 'Latn',
                                         'direction': 'ltr',
                                         'sourceLetterBidiCounts': {'L': 2919743},
                                         'sourceLetterUnicodeNamePrefixes': {'LATIN': 2919743},
                                         'scope': 'Language identity is supplied by the individual publisher '
                                                  'notice; IANA validates the selected '
                                                  'language/region/script subtags. All source letters were '
                                                  'inspected. Embedded Hebrew letters in Tandroy remain '
                                                  'exact. This is not native-language approval.'}},
 'tdx-tandroy': {'name': 'Saontsin’ Añahare (Tandroy Bible, publisher draft)',
                 'nativeTitle': 'Saontsin’ Añahare',
                 'abbreviation': 'TDX-DRAFT',
                 'language': 'tdx',
                 'publisher': 'eBible.org; copyright holder Steve Lellelid',
                 'translator': 'Not specified in the individual publisher notice.',
                 'revision': 'Publisher draft; copyright 2023 Steve Lellelid; source files dated 2026-10-17.',
                 'sourceUpdatedAt': '2026-10-17',
                 'sourceNoticeDate': '2024-12-05',
                 'publicationStatus': 'publisher-draft',
                 'script': 'Latn',
                 'direction': 'ltr',
                 'corpus': 'bible',
                 'providerId': 'tdx',
                 'canon': 'protestant-66',
                 'rightsObservedAt': '2026-11-05',
                 'sourceUrl': 'https://ebible.org/tdx/',
                 'formatUrl': 'https://ebible.org/find/details.php?id=tdx',
                 'downloadUrl': 'https://ebible.org/Scriptures/tdx_vpl.zip',
                 'downloadBytes': 4464787,
                 'licenseUrl': 'https://ebible.org/tdx/copyright.htm',
                 'license': 'CC BY-SA 4.0',
                 'licenseIdentifier': 'CC-BY-SA-4.0',
                 'attribution': 'Saontsin’ Añahare. Copyright © 2023 Steve Lellelid. Tandroy-Mahafaly '
                                'Malagasy; publisher draft. CC BY-SA 4.0. Source: https://ebible.org/tdx/. '
                                'Original VPL TXT wording unchanged; source formatting converted to JSON; '
                                'full notice retained.',
                 'sha256': 'ca352f5888aa64896069f57cea898abadb3f2f851a1d4f555ab088b2a601e960',
                 'xmlSha256': 'dd5191ff27a070311e44a278ab5c2f7565cb2e4a3bc2faed1ec7433af4772450',
                 'textSha256': 'ee5a425ddb4553266f56611b5d6e4dda1b8530b1dbccf7fdeb096ae3522cadb0',
                 'noticeSha256': '8404eb2b0401aec94dbaea7614894e28ad1c3140cc194e35c3be6ae4c00b7f0c',
                 'bracketExceptionCount': 10,
                 'bracketExceptionInventorySha256': '0cd3944e33ab07ce1374dd36f2719e436b89521e660a6678d1de0e52bf711040',
                 'bracketExceptionScope': '10 source records differ only at the exact pinned square-bracket '
                                          'positions. Authoritative TXT display is unchanged; no wording or '
                                          'source numbering is repaired.',
                 'expectedTotals': {'books': 66, 'chapters': 1189, 'verses': 31081},
                 'rights': {'redistribute': True,
                            'adapt': True,
                            'offline': True,
                            'audio': True,
                            'export': True},
                 'conditions': ['Retain the exact edition/revision identity, original source wording and '
                                'complete publisher notice with redistributed and offline copies.',
                                'Publisher VPL supplies verse text without separate notes, introductions, '
                                'headings or paragraph layout. Source numbering, empty source records, '
                                'inline characters and Unicode remain unchanged; no missing verse text is '
                                'fabricated.',
                                'No third-party recorded audio, cover artwork, illustrations, maps or '
                                'distinct modern revisions are included or licensed by this text import.',
                                'No provider certification badge, trademark endorsement or independent human '
                                'editorial or native-language approval is asserted.',
                                'This source is licensed text under CC BY-SA 4.0, not public domain. License '
                                'compliance is distinct from human editorial approval and from any external '
                                'model or service configuration.',
                                'PUBLISHER DRAFT: the source explicitly says DRAFT VERSION. Its installed '
                                'completeness and source checks do not mean editorial, theological or '
                                'native-language approval.',
                                'Retain Copyright © 2023 Steve Lellelid, source identity, license URL and '
                                'complete notice. CC BY-SA 4.0 permits sharing and adaptations subject to '
                                'attribution, indication of changes and share-alike obligations for '
                                'redistributed contributions to this text.',
                                'Pictures have separate restrictions and are not imported. The text license '
                                'does not establish third-party recording permissions.',
                                'Source numbering includes Joel 4 chapters and Malachi 3. Embedded Hebrew '
                                'acrostic letters are preserved alongside predominantly Latin-script Tandroy '
                                'text.'],
                 'rightsEvidenceUrls': ['https://creativecommons.org/licenses/by-sa/4.0/'],
                 'preserveSourceNotice': True,
                 'languageEvidence': {'registryUrl': 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
                                      'registryFileDate': '2026-09-17',
                                      'registrySha256': '755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1',
                                      'languageTag': 'tdx',
                                      'script': 'Latn',
                                      'direction': 'ltr',
                                      'sourceLetterBidiCounts': {'L': 2940964, 'R': 178},
                                      'sourceLetterUnicodeNamePrefixes': {'LATIN': 2940964, 'HEBREW': 178},
                                      'scope': 'Language identity is supplied by the individual publisher '
                                               'notice; IANA validates the selected language/region/script '
                                               'subtags. All source letters were inspected. Embedded Hebrew '
                                               'letters in Tandroy remain exact. This is not native-language '
                                               'approval.'},
                 'licenseDeedUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
                 'xmlBoundaryNbspExceptions': [{'bookId': 'ROM',
                                                'chapter': 11,
                                                'verse': 34,
                                                'xmlTextSha256': '0386c02186560260f0cbcbc6e15884f34a80bcdcfd655f895761f600e2b4d9e6',
                                                'textSha256': '61df17ecd5879bdf0d27409b9ab37f5610bb5c7f45c5fc933937f29e4d5b7b5a',
                                                'offset': 61,
                                                'character': '\xa0'},
                                               {'bookId': 'ROM',
                                                'chapter': 11,
                                                'verse': 35,
                                                'xmlTextSha256': '5126ac42b67b34722af57730869b1f4fffa21add8d62c7ec6e6ac35d89720ea9',
                                                'textSha256': '7519dd494a5f4b5007a2d5885fcd86fcae91aecf11ed3e6d9082893029c91e20',
                                                'offset': 39,
                                                'character': '\xa0'},
                                               {'bookId': 'ROM',
                                                'chapter': 15,
                                                'verse': 9,
                                                'xmlTextSha256': 'efaf0ed355d85e4bc0dc748b19e874ff6cdd20a2251ddfcfeb5bc054ed2d55ca',
                                                'textSha256': 'f4b3711d68ae5a3c250b45cdcaeec9f0706d62ea2548068444258619ff1560c9',
                                                'offset': 154,
                                                'character': '\xa0'},
                                               {'bookId': 'ROM',
                                                'chapter': 15,
                                                'verse': 12,
                                                'xmlTextSha256': 'a860657ef31e2ea7f64fcdb1091a4c4b2cc39a78dd20c5b36642e433f0d3feb1',
                                                'textSha256': '69d9fa73b4cc15e13e0e112b240fd04b1555b4bd7c44e0ad2e1fb92579fafa22',
                                                'offset': 120,
                                                'character': '\xa0'},
                                               {'bookId': 'ROM',
                                                'chapter': 15,
                                                'verse': 21,
                                                'xmlTextSha256': 'd465d2e0d0110103b40e04606440e594e24b74464c8da0af2459f496313f0566',
                                                'textSha256': '3a22ce717da8fe221ce4b1590961f92cc8598d46b962d42a3b6507be89c43d93',
                                                'offset': 95,
                                                'character': '\xa0'},
                                               {'bookId': '1CO',
                                                'chapter': 15,
                                                'verse': 55,
                                                'xmlTextSha256': 'e14ceb3f11043da875a605f3610e968c08e40541112400996fa65a7ae383e629',
                                                'textSha256': 'be98dc003bfa0e1efc09d3e1b82ccd95a9e465ed6a0ac18ad6d8014829d9ae72',
                                                'offset': 68,
                                                'character': '\xa0'},
                                               {'bookId': '1PE',
                                                'chapter': 4,
                                                'verse': 18,
                                                'xmlTextSha256': 'b600821f0a15a2344bb9b5eb7edfec3b2de00b08dccd177713cb9e5e42eb1189',
                                                'textSha256': '73d9196e858aac417ae144ff55fd9f999e4537530a9aefd075c5e4c1e031fc14',
                                                'offset': 103,
                                                'character': '\xa0'}],
                 'xmlBoundaryNbspInventorySha256': 'c8154b8a647450fafbd45bbb6a9c8edfc3309b38ec46f124fec54c1681255a98',
                 'formatEvidence': {'schemaVersion': 1,
                                    'sourceId': 'tdx-tandroy',
                                    'purpose': 'Independently locate the seven XML-only terminal NBSPs '
                                               'immediately before source USFM footnotes; comparison only, '
                                               'original VPL TXT unchanged.',
                                    'usfmArchive': {'url': 'https://ebible.org/Scriptures/tdx_usfm.zip',
                                                    'bytes': 1550381,
                                                    'sha256': 'ea4ce058200b73719aa62e989b371f19537cb6904c73b3aee66d83aac99b35b6'},
                                    'members': {'75-ROMtdx.usfm': {'bytes': 58765,
                                                                   'sha256': '2c5e7d746812d80a933398a24af7a15b6662b662e286f3701338e023ae43ae01'},
                                                '76-1COtdx.usfm': {'bytes': 55502,
                                                                   'sha256': 'adca90f3d2e96d3b67c7f2df15f8111dbdbb324e59fb60898ed2f4c715a1d3b0'},
                                                '90-1PEtdx.usfm': {'bytes': 15875,
                                                                   'sha256': 'f407a28242ad2d0b5bde78086ab4e5f6048b38441911c5ebe3d8d9200cc9fc0f'}},
                                    'records': [{'bookId': 'ROM',
                                                 'chapter': 11,
                                                 'verse': 34,
                                                 'usfmMember': '75-ROMtdx.usfm',
                                                 'usfmExcerpt': '\\v 34 Ia ty nahafohiñe ty faharofoana’ i '
                                                                'Talè?  \n'
                                                                '\\q1 Ia ty nimpanoro aze?\xa0\\f + \\fr '
                                                                '11:34 \\ft Ies 40:13\\f*   \n'
                                                                '\\q1\n',
                                                 'excerptSha256': '6c8af5418a33785da440ca14772436184ab0c9a7f21d1d5d28afff8de234145d',
                                                 'xmlTextSha256': '0386c02186560260f0cbcbc6e15884f34a80bcdcfd655f895761f600e2b4d9e6',
                                                 'textSha256': '61df17ecd5879bdf0d27409b9ab37f5610bb5c7f45c5fc933937f29e4d5b7b5a',
                                                 'xmlNbspOffset': 61},
                                                {'bookId': 'ROM',
                                                 'chapter': 11,
                                                 'verse': 35,
                                                 'usfmMember': '75-ROMtdx.usfm',
                                                 'usfmExcerpt': '\\v 35 Ia ty nanolotse ama’e aolo, '
                                                                'hañavaha’e?\xa0\\f + \\fr 11:35 \\ft Iob '
                                                                '35:7, 41:11\\f*   \n'
                                                                '\\q1\n',
                                                 'excerptSha256': '0fcc9a446240c16c1b41bbab328944b2a4fbb97df5d6749eb781986e94d34798',
                                                 'xmlTextSha256': '5126ac42b67b34722af57730869b1f4fffa21add8d62c7ec6e6ac35d89720ea9',
                                                 'textSha256': '7519dd494a5f4b5007a2d5885fcd86fcae91aecf11ed3e6d9082893029c91e20',
                                                 'xmlNbspOffset': 39},
                                                {'bookId': 'ROM',
                                                 'chapter': 15,
                                                 'verse': 9,
                                                 'usfmMember': '75-ROMtdx.usfm',
                                                 'usfmExcerpt': '\\v 9 naho fiferenaiñañe ty handrengea’ o '
                                                                'kilakila’ ndatio an’ Andrianañahare, fa hoe '
                                                                'ty pinatetse:  \n'
                                                                '\\q1 Ie rengèko amo kilakila’ndatio, vaho '
                                                                'ho saboeko ty tahina’o;\xa0\\f + \\fr 15:9 '
                                                                '\\ft Sa II 22:50; Sab 18:49\\f*   \n'
                                                                '\\p\n',
                                                 'excerptSha256': 'a7c1afce3746614ebb739c692d2cfa122e9bd78b4b8c6929273d23ade7e04fa6',
                                                 'xmlTextSha256': 'efaf0ed355d85e4bc0dc748b19e874ff6cdd20a2251ddfcfeb5bc054ed2d55ca',
                                                 'textSha256': 'f4b3711d68ae5a3c250b45cdcaeec9f0706d62ea2548068444258619ff1560c9',
                                                 'xmlNbspOffset': 154},
                                                {'bookId': 'ROM',
                                                 'chapter': 15,
                                                 'verse': 12,
                                                 'usfmMember': '75-ROMtdx.usfm',
                                                 'usfmExcerpt': '\\v 12 le tinovo’ Isaia ty hoe:  \n'
                                                                '\\q1 Hitotsake ty vaha’ i Jese le hitroatse '
                                                                're hifehe o fifeheañeo,  \n'
                                                                '\\q1 ie ty fitamà’ o kilakila’ndatio.\xa0'
                                                                '\\f + \\fr 15:12 \\ft Ies 11:10\\f*   \n'
                                                                '\\p\n',
                                                 'excerptSha256': 'cd6aa19dcbd10d2e83f41bede525ec34b34abfb0eaf42082d9b9aade15abed93',
                                                 'xmlTextSha256': 'a860657ef31e2ea7f64fcdb1091a4c4b2cc39a78dd20c5b36642e433f0d3feb1',
                                                 'textSha256': '69d9fa73b4cc15e13e0e112b240fd04b1555b4bd7c44e0ad2e1fb92579fafa22',
                                                 'xmlNbspOffset': 120},
                                                {'bookId': 'ROM',
                                                 'chapter': 15,
                                                 'verse': 21,
                                                 'usfmMember': '75-ROMtdx.usfm',
                                                 'usfmExcerpt': '\\v 21 Fa hoe ty pinatetse:  \n'
                                                                '\\q1 O tsy nitaliliañeo  \n'
                                                                '\\q1 ro hahaoniñe;  \n'
                                                                '\\q1 vaho o tsy nahajanjiñeo,  \n'
                                                                '\\q1 ro haharendreke.\xa0\\f + \\fr 15:21 '
                                                                '\\ft Ies 52:15\\f*   \n'
                                                                '\\p\n',
                                                 'excerptSha256': 'af88ed49d0b3cff3e5fba0b589f129d43917709b633b937d67d62a8b7a21e2c7',
                                                 'xmlTextSha256': 'd465d2e0d0110103b40e04606440e594e24b74464c8da0af2459f496313f0566',
                                                 'textSha256': '3a22ce717da8fe221ce4b1590961f92cc8598d46b962d42a3b6507be89c43d93',
                                                 'xmlNbspOffset': 95},
                                                {'bookId': '1CO',
                                                 'chapter': 15,
                                                 'verse': 55,
                                                 'usfmMember': '76-1COtdx.usfm',
                                                 'usfmExcerpt': '\\v 55 O Havilasio, aia ty fandrebaha’o?  \n'
                                                                '\\q1 O Tsikeokeokeo, aia ty finipoha’o?\xa0'
                                                                '\\f + \\fr 15:55 \\ft Hos 13:14\\f*   \n'
                                                                '\\p\n',
                                                 'excerptSha256': '655c384533857e819fc660138896c7def48301572e1e9b58fbf6e22adf1e8121',
                                                 'xmlTextSha256': 'e14ceb3f11043da875a605f3610e968c08e40541112400996fa65a7ae383e629',
                                                 'textSha256': 'be98dc003bfa0e1efc09d3e1b82ccd95a9e465ed6a0ac18ad6d8014829d9ae72',
                                                 'xmlNbspOffset': 68},
                                                {'bookId': '1PE',
                                                 'chapter': 4,
                                                 'verse': 18,
                                                 'usfmMember': '90-1PEtdx.usfm',
                                                 'usfmExcerpt': '\\v 18 Aa katao sarotse ho rombaheñe  \n'
                                                                '\\q1 ty vantañe,  \n'
                                                                '\\q1 akore ty hifetsak’ ami’ty tsy '
                                                                'aman-Kake  \n'
                                                                '\\q1 naho amy aman-kakeoy?\xa0\\f + \\fr '
                                                                '4:18 \\ft Rzs 11.31\\f*   \n'
                                                                '\\p\n',
                                                 'excerptSha256': 'fdf6cb804d29dc84b6229d0721102d8d06d162497315b6bb7627da6eed210671',
                                                 'xmlTextSha256': 'b600821f0a15a2344bb9b5eb7edfec3b2de00b08dccd177713cb9e5e42eb1189',
                                                 'textSha256': '73d9196e858aac417ae144ff55fd9f999e4537530a9aefd075c5e4c1e031fc14',
                                                 'xmlNbspOffset': 103}]}}})

SOURCES['lat-clementine1598'] = {
    'name': 'Clementine Vulgate 1598', 'language': 'la', 'corpus': 'bible', 'publisher': 'eBible.org',
    'translator': 'Jerome', 'revision': 'Clementine Vulgate of 1598; publisher title also identifies the Glossa Ordinaria Migne edition 1880; verse text only',
    'abbreviation': 'VULC', 'nativeTitle': 'Bibbia Vulgata Clementina na 1598', 'script': 'Latn', 'direction': 'ltr',
    'sourceNoticeDate': '2014-08-23', 'sourceUpdatedAt': '2025-12-12', 'rightsObservedAt': '2026-11-12',
    'sourceUrl': 'https://ebible.org/latVUC/',
    'formatUrl': 'https://ebible.org/find/details.php?id=latVUC',
    'downloadUrl': 'https://ebible.org/Scriptures/latVUC_vpl.zip',
    'licenseUrl': 'https://ebible.org/latVUC/copyright.htm', 'license': 'Public domain',
    'licenseIdentifier': 'LicenseRef-Public-Domain',
    'attribution': 'Clementine Vulgate of 1598 with Glossa Ordinaria Migne edition 1880 in Latin. Verse text only. Source: eBible.org.',
    'sha256': 'bf13a76cc8131fd469a48158c79d9b2adcaad15766ec53852322fb71ca25301b',
    'xmlSha256': '5f6ad319ea6877a1cfb10e55794f43f43922f346ad3064e35803252ec70cb9cf',
    'textSha256': '41de172765e2209386d273d352695df54dc2ac85a8ce522fd807f52f6e3fc398',
    'noticeSha256': '05651383a53a2759af4656570a766e62ce0fb021dcdeef0f3c7bd1559041f91f',
    'bracketExceptionCount': 1826,
    'bracketExceptionInventorySha256': '060b65dc2f9e8c9dfb71fed57834f74ecec9de3913a445c34cbef32d9031e556',
    'bracketExceptionScope': '1826 exact TXT square-bracket positions differ from the XML representation. Display preserves the complete publisher TXT; no wording, punctuation or book/chapter/verse numbering is changed.',
    'providerId': 'latVUC', 'downloadBytes': 4920214, 'canon': 'latin-vulgate-73',
    'canonProfile': {
        'id': 'latin-vulgate-73', 'label': 'Clementine Vulgate source list · 73 books',
        'description': 'The list and order describe the 73 book entries supplied in this publisher archive. They record this edition’s coverage and do not claim one canon for all Christian traditions.',
        'sourceUrl': 'https://ebible.org/find/details.php?id=latVUC', 'bookCount': 73, 'oldTestamentBookCount': 46,
    },
    'bookOrder': [
        ('GEN','Genesis'),('EXO','Exodus'),('LEV','Leviticus'),('NUM','Numbers'),('DEU','Deuteronomy'),('JOS','Joshua'),('JDG','Judges'),('RUT','Ruth'),('1SA','1 Samuel'),('2SA','2 Samuel'),('1KI','1 Kings'),('2KI','2 Kings'),('1CH','1 Chronicles'),('2CH','2 Chronicles'),('EZR','Ezra'),('NEH','Nehemiah'),('EST','Esther'),('JOB','Job'),('PSA','Psalms'),('PRO','Proverbs'),('ECC','Ecclesiastes'),('SNG','Song of Solomon'),('ISA','Isaiah'),('JER','Jeremiah'),('LAM','Lamentations'),('EZK','Ezekiel'),('DAN','Daniel'),('HOS','Hosea'),('JOL','Joel'),('AMO','Amos'),('OBA','Obadiah'),('JON','Jonah'),('MIC','Micah'),('NAM','Nahum'),('HAB','Habakkuk'),('ZEP','Zephaniah'),('HAG','Haggai'),('ZEC','Zechariah'),('MAL','Malachi'),
        ('TOB','Tobit'),('JDT','Judith'),('WIS','Wisdom'),('SIR','Sirach'),('BAR','Baruch'),('1MA','1 Maccabees'),('2MA','2 Maccabees'),
        ('MAT','Matthew'),('MRK','Mark'),('LUK','Luke'),('JHN','John'),('ACT','Acts'),('ROM','Romans'),('1CO','1 Corinthians'),('2CO','2 Corinthians'),('GAL','Galatians'),('EPH','Ephesians'),('PHP','Philippians'),('COL','Colossians'),('1TH','1 Thessalonians'),('2TH','2 Thessalonians'),('1TI','1 Timothy'),('2TI','2 Timothy'),('TIT','Titus'),('PHM','Philemon'),('HEB','Hebrews'),('JAS','James'),('1PE','1 Peter'),('2PE','2 Peter'),('1JN','1 John'),('2JN','2 John'),('3JN','3 John'),('JUD','Jude'),('REV','Revelation'),
    ],
    'expectedTotals': {'books': 73, 'chapters': 1334, 'verses': 35809},
    'rightsEvidenceUrls': ['https://ebible.org/legal.php', 'https://ebible.org/publicdomain.htm'],
    'preserveSourceNotice': True,
    'rights': {'redistribute': True, 'adapt': True, 'offline': True, 'audio': True, 'export': True},
    'conditions': [
        'Retain the exact Clementine Vulgate source identity, source revision and complete publisher notice with redistributed and offline copies.',
        'The publisher marks this text Public Domain. Its general policy asks users to verify applicable intellectual-property law; this record does not claim independent worldwide legal review.',
        'The publisher ZIP archive contains Bible verse text only. No Glossa Ordinaria commentary, notes, introductions, headings, artwork or recorded audio are imported.',
        'The profile records the 73 ordered source-book entries in this archive. It does not claim one canon for all Christian traditions or assert review of theological claims.',
        'No provider endorsement, certification badge or independent human editorial review is asserted.',
    ],
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def canonical_generated_bytes(name, raw):
    # Git may check out generated text with CRLF on Windows. Normalize only
    # line endings for verification; source members remain pinned by archive
    # hashes, and preserved notice files are protected by .gitattributes.
    if name.endswith(('.json', '.txt')):
        return raw.replace(b'\r\n', b'\n')
    return raw


def generated_hash_matches(name, raw, expected):
    return sha(raw) == expected or sha(canonical_generated_bytes(name, raw)) == expected


def edition_metadata(edition_id):
    source = SOURCES[edition_id]
    fields = ('name', 'language', 'corpus', 'publisher', 'translator', 'sourceUpdatedAt', 'sourceUrl', 'formatUrl',
              'downloadUrl', 'licenseUrl', 'license', 'licenseIdentifier', 'licenseDeedUrl', 'attribution', 'sha256', 'rights', 'conditions',
              'abbreviation', 'revision', 'canon', 'canonProfile', 'providerId', 'downloadBytes',
              'nativeTitle', 'script', 'direction', 'sourceNoticeDate', 'publicationStatus')
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
    # The Tandroy VPL XML retains seven exact NBSP separators before omitted
    # footnotes; the TXT omits them. This is a source-pinned comparison only.
    # Never trim Unicode whitespace generally or alter authoritative TXT.
    for exception in SOURCES[edition_id].get('xmlBoundaryNbspExceptions', []):
        if any(exception[key] != record[key] for key in record):
            continue
        if (sha(xml_row['text'].encode('utf-8')) != exception['xmlTextSha256']
                or sha(text.encode('utf-8')) != exception['textSha256']
                or exception['offset'] != len(text)
                or exception['character'] != '\u00a0'
                or xml_row['text'] != text + '\u00a0'):
            raise ValueError('Pinned XML footnote-boundary NBSP record changed.')
        return {**record, 'publisherXmlBoundaryNbsp': {'offset': exception['offset'], 'character': '\u00a0'},
                'xmlTextSha256': exception['xmlTextSha256'], 'textSha256': exception['textSha256']}
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
        # One reviewed source record retains an ASCII space inside its closing
        # supplied-word bracket. Exact coordinates, text hashes and positions
        # are pinned; this never permits generic trimming or display changes.
        for exception in SOURCES[edition_id].get('bracketPaddingExceptions', []):
            if any(exception[key] != record[key] for key in record):
                continue
            padding = exception['paddingPositions']
            if (sha(xml_row['text'].encode('utf-8')) != exception['xmlTextSha256']
                    or sha(text.encode('utf-8')) != exception['textSha256']
                    or not padding or not brackets
                    or any(marker.get('character') != ' ' or not isinstance(marker.get('offset'), int)
                           or not 0 <= marker['offset'] < len(text) or text[marker['offset']] != ' '
                           for marker in padding)):
                raise ValueError('Pinned publisher bracket padding source record changed.')
            excluded = {marker.start() for marker in brackets} | {marker['offset'] for marker in padding}
            if ''.join(character for offset, character in enumerate(text) if offset not in excluded) == xml_row['text']:
                return {**record, 'publisherMarkers': [marker[0] for marker in re.finditer(r'\[[^\[\]\r\n]+\]', text)],
                        'bracketPositions': [{'offset': marker.start(), 'character': marker[0]} for marker in brackets],
                        'publisherPaddingPositions': padding}
    raise ValueError('Publisher exports disagree beyond the pinned source-specific bracket format exception.')


def verify_vpl_format_inventory(edition_id, differences):
    source = SOURCES[edition_id]
    boundaries = [value for value in differences if 'publisherXmlBoundaryNbsp' in value]
    if (len(boundaries) != len(source.get('xmlBoundaryNbspExceptions', []))
            or boundaries and sha(json_bytes(boundaries)) != source.get('xmlBoundaryNbspInventorySha256')):
        raise ValueError(f'{edition_id}: XML footnote-boundary exception inventory changed.')
    bracket_differences = [value for value in differences if 'publisherXmlBoundaryNbsp' not in value]
    if 'bracketExceptionCount' in source:
        if len(bracket_differences) != source['bracketExceptionCount'] or sha(json_bytes(bracket_differences)) != source['bracketExceptionInventorySha256']:
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
    edition_books = source.get('bookOrder', BOOKS)
    books = OrderedDict((bid, {'id': bid, 'name': name, 'chapters': []}) for bid, name in edition_books)
    rows, seen_book_order = [], []
    for verse in document:
        if verse.tag != 'v' or len(verse) or set(verse.attrib) != {'b', 'c', 'v'}:
            raise ValueError('Unexpected XML structure; source review is required.')
        source_bid, chapter_label, verse_label = (verse.attrib[key] for key in ('b', 'c', 'v'))
        bid = TEXT_IDS.get(source_bid, source_bid)
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
        raise ValueError(f'The publisher export book list/order does not match the pinned {len(books)}-book profile.')
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
    if source.get('preserveSourceNotice'):
        files['SOURCE_NOTICE.html.txt'] = notice
    if source.get('formatEvidence'):
        files['FORMAT_EVIDENCE.json'] = json_bytes(source['formatEvidence'])
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
        bracket_differences = [value for value in formatting_differences if 'publisherXmlBoundaryNbsp' not in value]
        provenance.update({
            'xmlPlainTextCrossCheck': 'All words, punctuation and references agree after comparison-only removal of the recorded TXT square brackets. Display text retains every bracket unchanged.',
            'publisherBracketFormatDifferences': bracket_differences,
            'publisherBracketInventorySha256': sha(json_bytes(bracket_differences)),
            'publisherBracketOffsetUnit': 'unicode-codepoint',
            'publisherBracketScope': source.get('bracketExceptionScope', '4316 balanced supplied-word/other bracket spans and 76 verse-level unpaired cases, including Selah/Higgaion markers and John 7:53–8:11 textual-variant brackets. The original TXT is not repaired or renumbered.'),
        })
        provenance['normalization'][3] = 'Use publisher VPL TXT unchanged as display text, retaining supplied-word, musical-marker and textual-variant brackets.'
    if source.get('xmlBoundaryNbspExceptions'):
        boundaries = [value for value in formatting_differences if 'publisherXmlBoundaryNbsp' in value]
        provenance.update({
            'xmlPlainTextCrossCheck': 'All source references and characters agree except the separately pinned TXT square brackets and XML-only terminal NBSP separators before omitted source footnotes. Both comparison inventories are exact; displayed TXT is unchanged.',
            'publisherXmlBoundaryNbspDifferences': boundaries,
            'publisherXmlBoundaryNbspInventorySha256': sha(json_bytes(boundaries)),
            'publisherXmlBoundaryNbspOffsetUnit': 'unicode-codepoint',
            'formatEvidenceFile': 'FORMAT_EVIDENCE.json',
        })
        provenance['normalization'].append('Comparison only: omit one terminal XML U+00A0 at each exact coordinate/hash/offset-pinned footnote boundary independently evidenced by USFM. No general Unicode trimming or display-text change is performed.')
    if source.get('preserveSourceNotice'):
        provenance['sourceNoticeRawFile'] = 'SOURCE_NOTICE.html.txt'
    if source.get('languageEvidence'):
        provenance['languageEvidence'] = source['languageEvidence']
    if source.get('bracketPaddingExceptions'):
        provenance['xmlPlainTextCrossCheck'] = 'All source characters and references agree except the exact pinned TXT square brackets and separately pinned ASCII padding position. This comparison-only exception never changes displayed TXT.'
        provenance['publisherBracketPaddingExceptions'] = source['bracketPaddingExceptions']
        provenance['normalization'].append('Comparison only: remove the single pinned ASCII space before the supplied-word closing bracket at Tongan Mark 13:3; keep it in displayed TXT.')
        provenance['formatEvidenceFile'] = 'FORMAT_EVIDENCE.json'
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

    for book_id, book_name in source.get('bookOrder', BOOKS):
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
            if not generated_hash_matches(name, target.read_bytes(), expected):
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
    # Validate all selected archives before replacing any generated output.
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
