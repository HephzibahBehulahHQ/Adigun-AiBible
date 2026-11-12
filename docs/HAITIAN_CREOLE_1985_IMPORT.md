# Haitian Creole Bible 1985 source import

## Edition identity and source pins

- Publisher record: [eBible.org, Bib La / Haitian Creole Bible 1985](https://ebible.org/details.php?id=hat)
- Individual publisher notice: [Public-domain notice](https://ebible.org/hat/copyright.htm)
- Exact archive: `https://ebible.org/Scriptures/hat_vpl.zip`
- Archive SHA-256: `179d9cbd450da032f259f60914af3d61f6cb5e03cd8d32538872401896f9b5d9` (4,460,556 bytes)
- Imported display member: `hat_vpl.txt`; structure and independent text comparison: `hat_vpl.xml`.
- Member SHA-256: TXT `0725fadf13202d5356ff8026bc930655d632efffa9868ffe6cf195882a4d3fd6`; XML `c53cc29e21aaa40b0e73e2e44df26965586c3b4f7401d4395fb28c3597436f84`; notice `6d02516e4cf7fd16cbfce8db3a0db90ec5dfc48688daa8889340ee0dbf7ba2dd`.
- Source inventory: 66 ordered books, 1,189 chapters and 31,102 numbered records. TXT and XML have identical references and text across all 31,102 rows.

The publisher identifies this edition as *Bib La*, the Haitian Creole Bible 1985. Its notice declares the text Public Domain because it was published without copyright notice in 1985 and had no subsequent registration within five years. This is the publisher’s statement, not an independent worldwide legal opinion. The exact archive notice is preserved in `data/editions/hat-1985/SOURCE_NOTICE.html.txt`, and the use conditions are recorded in the rights register.

The archive states it contains Bible text only and omits formatting, paragraph breaks, notes, introductions and noncanonical section titles. No other material or editorial review is implied.

## Reproduce and verify

Keep the official archive outside the repository as `hat-1985.zip`. With Python 3.12 or later:

```sh
python scripts/import-editions.py --source-dir /absolute/path/outside-repository/edition-sources --edition hat-1985 --check
python scripts/import-editions.py --verify
```

The import pins the archive and member hashes, publisher book order and totals, exact TXT/XML comparison, source notice, generated files, catalog entry, rights record, and zero publisher-speech coverage. A changed source archive or generated artifact fails verification.
