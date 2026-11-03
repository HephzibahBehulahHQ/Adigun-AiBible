# HB reference audit

The application uses the established HB identity and new product-specific components. Reference repositories remain read-only.

| Repository / checked revision | Reused foundation |
|---|---|
| `hb-design-system@52f01f9986d97088413ca9785bc7a2d3f2967123` | `tokens/corporate.json`: navy `#0B1220`, gold `#D4AF37`, royal blue `#2563EB`, ivory `#F8FAFC`; `tokens/brands.json`: Evangelism gold; `assets/corporate/hephzibah-behulah-official.jpg`; `components/AdigunBot/live-copilot.md`; `templates/universal-product/product.config.json` |
| `hb-evangelism@239352d924e27af6e8318afba65985e6a67b964a` | Christian division identity and source/content guidance from `README.md` and `docs/content-guidance.md` |
| `HephzibahBehulahHQ.github.io@bd116504412b37105166805018f64a6e7bbe3cde` | Corporate identity and site-level navigation/footer reference; no unrelated website modification |
| `hb-AI-policy@d42d4e04ac6ab77ebafa1d4fccb724a4dde8d02e` | Pinned engineering policy, checkpointing, verification and concise reporting; adopted in `AGENTS.md` |

The React reader, local BOT action adapter, media renderer, source importers and offline system are new implementation work. Reference component contracts were not represented as installed packages or live services. No working prerecorded-video package, theological reviewer registry, licensed historical reading pack or Bible-specific cloud project was supplied by these references. AdigunSPs is a separate PLC product and was not used as this app's repository.

`product.config.json` explicitly leaves accounts, cloud saving, assistant endpoint and Supabase project disabled or null. Device-based saving is supported, but browser persistence is not guaranteed permanent storage.
