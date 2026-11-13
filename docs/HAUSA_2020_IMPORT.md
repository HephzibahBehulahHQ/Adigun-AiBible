# Hausa Bible source record

## Edition identity

- Exact edition: Biblica® Open Hausa Contemporary Bible™ / Biblica® Buɗaɗɗen Littafi Mai Tsarki, Sabon Rai Don Kowa™.
- Publisher/translator: Biblica, Inc.; distributed by eBible.org.
- Provider ID: `hausa`; application edition ID: `hausa2020`; BCP 47 tag: `ha` (Hausa); Latin script, left to right.
- Revision/copyright shown by the publisher: © 2009, 2020. The archived notice is dated 3 May 2025.
- Publisher source: https://ebible.org/hausa/ . Individual source notice: https://ebible.org/hausa/copyright.htm .

## Reproduction and coverage

- Download: https://ebible.org/Scriptures/hausa_vpl.zip . Preserve it outside the repository as `hausa2020.zip` when reproducing the import.
- Archive SHA-256: `b4780ea28fc95ee7ca58ce7b0f75dc35a04201561735cb304cf557459d60d821` (4,208,783 bytes).
- Publisher VPL members: `hausa_vpl.txt` SHA-256 `27e785e204d15c7a7be1764290d22258cc7e7019f582cf5d96ef41a6b0048ee2`; `hausa_vpl.xml` SHA-256 `508a394c4d641132ae0b1ef4fd3d8859497e4f499ddcc6744ec9ae860eb2238e`; `hausa_about.htm` SHA-256 `86396fb3432a9d0820a6da0a11ab7d866f4bed4b72c210dd0c5a182cbb7bf78f`.
- The archive supplies the standard 66-book order, 1,189 chapters and 31,087 numbered verse records. TXT and XML have the same records and wording; the importer rejects unpinned differences. These counts describe the supplied archive, not a universal canon.
- Only publisher verse text is included. The VPL export does not supply the publisher's paragraph layout, notes, illustrations, page design, introductions or recorded audio. Application book-name labels are navigation metadata.
- The 6.2 MB search index is derived from the pinned book files and omitted from Git; the importer verifies its recorded hash and the build regenerates it before static publication.
- Reproduce and verify with `python scripts/import-editions.py --source-dir <directory-containing-hausa2020.zip> --edition hausa2020 --check`; validate generated files with `python scripts/import-editions.py --verify`.

## Rights and use limits

The exact source notice identifies the text as CC BY-SA 4.0 and permits redistribution in any format and reasonable revision/adaptation under attribution, ShareAlike, change-disclosure and Biblica trademark conditions. The imported wording is unchanged and the complete publisher notice is retained. Keep Biblica marks with unchanged text; do not imply publisher endorsement. Any modified text must disclose changes, remove Biblica marks and remain CC BY-SA 4.0. This text grant does not cover third-party images or recordings.

The edition has a worldwide display grant recorded against this exact archive hash. It does not establish native-language/editorial approval or permission to send the text to an external AI service. AI product use remains gated while Biblica's separate product-wide AI policy is unresolved. No provider endorsement or independent Hausa review is claimed.
