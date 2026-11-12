# Clementine Vulgate 1598 source import

## Source identity

- Publisher record: [eBible latVUC](https://ebible.org/find/details.php?id=latVUC)
- Exact archive: `https://ebible.org/Scriptures/latVUC_vpl.zip`
- Archive SHA-256: `bf13a76cc8131fd469a48158c79d9b2adcaad15766ec53852322fb71ca25301b`
- Imported display member: `latVUC_vpl.txt`; the publisher XML member is used for structure and cross-checking.
- Publisher-declared title: Clementine Vulgate of 1598 with Glossa Ordinaria Migne edition 1880. The archive itself supplies Bible verse text only; commentary and other edition materials are not imported.
- Verified totals: 73 ordered source-book entries, 1,334 chapters, 35,809 source verse records. The seven entries after Malachi and before Matthew are Tobit, Judith, Wisdom, Sirach, Baruch, 1 Maccabees and 2 Maccabees. They belong to this source list; the product makes no universal canon claim.

## Rights and limits

The publisher marks this text Public Domain in its [edition notice](https://ebible.org/latVUC/copyright.htm). The [provider policy](https://ebible.org/legal.php) asks users to verify applicable intellectual-property laws. The app records the publisher declaration and notice; it does not assert independent worldwide legal review. Keep the complete source notice and exact revision identity with redistributed and offline copies. No audio, artwork, commentary, independent editorial approval or publisher endorsement is included or asserted.

## Reproducibility

Run `python scripts/import-editions.py --source-dir <directory-outside-repository> --edition lat-clementine1598 --check` with the pinned archive named `lat-clementine1598.zip`. The importer verifies the archive and member hashes, publisher book order, chapter/verse totals, complete notices, and generated artifacts. `--verify` checks committed outputs without the raw archive.

The 1,826 square-bracket differences between publisher TXT and XML are pinned in provenance as formatting only. The complete TXT is the unchanged display source; no wording or reference numbering is edited to reconcile the XML representation.
