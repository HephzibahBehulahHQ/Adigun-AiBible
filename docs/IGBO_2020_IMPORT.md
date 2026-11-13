# Igbo Bible source record

## Edition identity

- Exact edition: Biblica® Open Igbo Contemporary Bible™ / Biblica® Baịbụlụ Nsọ nʼIgbo Ndị Ugbu a nke dịrị onye ọbụla ịgụ.
- Publisher/translator: Biblica, Inc.; distributed by eBible.org.
- Provider ID: `ibo`; application edition ID: `igbo2020`; BCP 47 language tag: `ig` (Igbo); Latin script, left to right.
- Copyright years printed in the source notice: © 1980, 1988, 2019, 2020. The archived notice is dated 12 April 2023.
- Publisher source: https://ebible.org/ibo/ . Individual source notice: https://ebible.org/ibo/copyright.htm . The eBible.org copyright inventory identifies this edition on line 525.

## Reproduction and coverage

- Download: https://ebible.org/Scriptures/ibo_vpl.zip . Preserve it outside the repository as `igbo2020.zip` when reproducing the import.
- Archive SHA-256: `fe4030d183c5514c879b93f863abbe5f12f707024168d05925a129b093fef684` (4,766,484 bytes).
- Publisher VPL members: `ibo_vpl.txt` SHA-256 `b75fea29a54cd89c3b445142883d5c3024118778225aaddf75dfccafe31f411a`; `ibo_vpl.xml` SHA-256 `bf5c3fcc875d1b762b86669f481702248f6bf8ec0ee0c70dd739c72dfbb22497`; `ibo_about.htm` SHA-256 `08d7a18c6d6af7906ae62f83fc5224a28eca2e9ac7c6b3007907187444fe6dfb`.
- The archive supplies 66 publisher-ordered books, 1,189 chapters and 31,103 verse records. TXT and XML references and wording agree after mapping publisher book abbreviations and removing only ASCII boundary padding from the XML comparison. The original publisher TXT wording is the displayed text.
- Only publisher verse text is included. The VPL archive states that formatting, paragraph breaks, notes, introductions and noncanonical section titles have been removed. These counts describe this archive, not a universal canon; no missing verse wording is fabricated.
- The 7.3 MB search index is derived from the pinned book files and omitted from Git; the importer verifies its recorded hash and the build regenerates it before static publication.
- Reproduce and verify with `python scripts/import-editions.py --source-dir <directory-containing-igbo2020.zip> --edition igbo2020 --check`; validate generated files with `python scripts/import-editions.py --verify`.

## Rights and use limits

The exact source notice identifies the text as CC BY-SA 4.0 and permits redistribution in any format and reasonable revisions/adaptations under attribution, ShareAlike, change disclosure and Biblica trademark conditions. The imported wording is unchanged and the complete publisher notice is retained. Keep Biblica marks with unchanged text; do not imply publisher endorsement. Modified text must disclose changes, remove Biblica marks and remain CC BY-SA 4.0. This text grant does not cover third-party images or recordings.

The edition has a worldwide display grant recorded against this exact archive hash. It does not establish native-language/editorial approval or permission to send the text to an external AI service. AI product use remains gated while Biblica's separate product-wide AI policy is unresolved. No provider endorsement or independent Igbo review is claimed.
