# Croatian Šarić Bible source import

## Source identity

- Publisher record: [eBible.org, Sveta Biblija (`hrv`)](https://ebible.org/details.php?id=hrv)
- Individual notice: [eBible.org Croatian copyright notice](https://ebible.org/hrv/copyright.htm)
- Archive: [hrv_vpl.zip](https://ebible.org/Scriptures/hrv_vpl.zip)
- Edition ID in this app: `hrv-saric`
- Publisher identity: *The Holy Bible in the Croatian language, translated by Ivan Šarić Sarajevo*; native title *Sveta Biblija*.
- The archive's `hrv_about.htm` identifies the package as Bible text only and dates that package notice 2019-12-16. That package date is not asserted as the translation date.

The publisher archive is pinned at 5,050,617 bytes, SHA-256 `a9fc8665d3c1e5e806b2b33456c96d84cc4866cc6f9d9ab8d36d9e1c1ccb0e2a`. Its three imported members are:

| Archive member | SHA-256 |
| --- | --- |
| `hrv_vpl.xml` | `176c28d2b64c14f267371f7117e1d106bf3500c1c5de3ffeba34d564d9ac65f0` |
| `hrv_vpl.txt` | `b35e8a54804809409d2214e72b8cd1dc58420e0ec79b3a09de6dc8f46c858f39` |
| `hrv_about.htm` | `157d83548e21a20211997975627005102b495ccda9b0a396bfbea39e3b5097c4` |

The import contains 73 ordered source books, 1,328 chapters and 35,448 verse records. The unchanged VPL TXT is the display source; the XML and TXT references match in order after applying the publisher abbreviation mapping, including `SOL` to `SNG`.

## Book profile and source exceptions

The manifest follows the publisher's exact 73-book order and assigns the source's 46-entry Old Testament boundary to profile `hrv-saric-source-order-73`. It describes this archive's coverage; it does not claim one canon for all Christian traditions. The source calls its Esther entry `ESG`; this ID remains unchanged in stored books, URLs and references, while its English navigation label is “Esther”.

The publisher archive lists verse numbers out of numeric order in seven chapters: 1 Samuel 9, Job 36, Isaiah 33, Jeremiah 29 and 36, Nahum 2, and Habakkuk 2. The importer verifies each complete source sequence against the pinned inventory, verifies XML/TXT reference order, and only then emits chapter/search records in ascending numeric reference order. The original archive and display wording are not reordered or edited. The exact sequences and inventory hash are in `data/editions/hrv-saric/provenance.json`.

Twenty-nine TXT/XML text differences are only bracket formatting. Each source reference, bracket character and Unicode offset is pinned in provenance. Comparison removes those characters only for validation; displayed text retains the publisher's TXT exactly. The source notice and raw TXT/XML members remain separately hashed.

The VPL archive omits layout, paragraph breaks, footnotes, introductions and section titles. No omitted material is reconstructed. Empty records and numbered gaps remain explicit in the generated inventory.

## Rights and use limits

eBible.org declares this text Public Domain in its source listing and individual notice. The rights register attributes that declaration to the publisher and does not present it as an independent worldwide legal opinion. Keep the full archive notice with copies. The VPL package contains text only; it grants no rights to any third-party recording. Recorded audio remains unknown/not acquired, and the edition does not imply provider endorsement or independent Croatian editorial review.

## Reproduce the import

Keep the official archive outside the repository as `hrv-saric.zip`. With Python 3.12 or later:

```sh
python scripts/import-editions.py --source-dir /absolute/path/outside-repository/edition-sources --edition hrv-saric
python scripts/import-editions.py --source-dir /absolute/path/outside-repository/edition-sources --edition hrv-saric --check
```

The importer verifies the archive and member hashes, book order, exact XML/TXT references, bracket-difference inventory, seven reference-order exception sequences and expected totals before accepting the generated artifacts.
