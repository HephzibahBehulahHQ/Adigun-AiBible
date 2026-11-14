# King James Version source review

**Decision: defer installation.** The exact eBible.org source is the *King James (Authorized) Version*, identified as KJV, using the standardized 1769 text, protocanon only. Its VPL archive was observed on 14 November 2026. The publisher describes it as public domain outside the United Kingdom; its notice says letters patent require permission to print this text in the UK or import printed copies into the UK. This project requires worldwide display rights for a static release and currently has no selective country delivery. The source is therefore not installed or exposed in the reader.

- [Publisher details and downloads](https://ebible.org/find/details.php?id=eng-kjv2006)
- [Individual publisher copyright notice](https://ebible.org/eng-kjv2006/copyright.htm)
- [Publisher VPL archive](https://ebible.org/Scriptures/eng-kjv2006_vpl.zip)

The pinned archive SHA-256 is `ee4cae32cddded36d9dfcb524c70c03dcf930cf04924ca34c9b805bac39210d4`. It contains 66 books in canonical order, 1,189 chapters, 31,102 verse records, no empty records, and no combined verse ranges. XML and TXT references agree. Of the records, 16,861 agree apart from trailing ASCII padding; the remaining 14,241 differ only by the publisher's bracket markers. The TXT wording and markers have not been normalized into display content. Archive member hashes and the inspection result are recorded in `data/editions/acquisition-catalog.json`.

This is a source and rights review only. The candidate remains `metadata-only`, is absent from the installed edition catalog and rights register, and must not be counted as an available KJV edition until its global distribution scope is resolved.

