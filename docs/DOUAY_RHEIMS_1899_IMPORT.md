# Douay-Rheims 1899 source import

## Source identity and reproduction

- Publisher record: [eBible.org Douay-Rheims 1899](https://ebible.org/find/details.php?id=engDRA)
- Individual publisher notice: [Public Domain and translation credit](https://ebible.org/engDRA/copyright.htm)
- Exact source archive: `https://ebible.org/Scriptures/engDRA_vpl.zip`
- Archive SHA-256: `7e267290077a9ac9432ac4bd95e53096c77bf9aedc8ba4020503402863f2a7f0`
- Imported display member: `engDRA_vpl.txt`; `engDRA_vpl.xml` supplies structure and an independent text comparison.
- Member SHA-256: XML `5a0f1e8d430909cc12b425212fdedfe522f5ebe1745b51bb0d89bdf65c5a4000`; VPL text `96282bfa7c89a74680cea66fe873aafa5e7cd446407f0ff2531a723e19eee2c2`; notice `4b102b25fc82f25a433640cf3a204a14cc5087faf946c820bd5fdcf3fe28eb97`.
- Verified source totals: 73 ordered books, 1,334 chapters and 35,811 numbered verse records.

The publisher names the work *The Holy Bible in English, Douay-Rheims American Edition of 1899*, credits the English College, Douai, and identifies its text as Public Domain. Its provider policy permits copying and adaptation of works it marks Public Domain while directing users to follow applicable intellectual-property law. The product records those publisher statements and does not claim independent worldwide legal review. Preserve the complete notice with redistributed and offline copies.

The archive says it contains Bible text only and omits formatting, paragraph breaks, notes, introductions and section titles. No commentary, artwork, publisher speech annotations or recorded audio are imported. No publisher endorsement or independent human editorial review is asserted.

### Edition-specific book profile

The profile preserves the archive’s 73-book order and records the 46-entry Old Testament boundary, with Tobit through 2 Maccabees before Matthew. This describes this edition’s source list and does not claim one canon for all Christian traditions.

### Source comparison exceptions

Six Psalm superscription cross-references contain square brackets in the publisher TXT export but omit those bracket characters in the XML export. Each reference and bracket position is pinned in `data/editions/eng-douay-rheims1899/provenance.json`. The full publisher TXT remains unchanged and is the displayed wording; no text or reference numbering is inferred or repaired.

### Reproduce and verify

Keep the publisher archive outside the repository as `eng-douay-rheims1899.zip`. With Python 3.12 or later:

```sh
python3 scripts/import-editions.py --source-dir /absolute/path/outside-repository/edition-sources --edition eng-douay-rheims1899 --check
python3 scripts/import-editions.py --verify
```

The importer checks the pinned archive and member hashes, publisher list and order, source references, exact TXT/XML formatting-exception inventory, notice and generated artifacts. A different source archive or changed exception fails verification.
