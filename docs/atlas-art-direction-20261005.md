# Historical atlas and political newspaper
Branch: `experiment/atlas-newspaper-20261005`. Based on the restored v18 release.
Entry: `atlas.html`. The normal v18 entry and all original game modules remain unchanged.

## Scope
A single coherent art direction, with a new composed title page, genuine historical images, separate book and UI fonts, horizontal leader profiles, a structured newspaper and diplomatic letter styling.
No new model calls, mechanics, scenario economics or quotas. Existing generated portraits override the display-only historical catalog. Catalog lookup is by current person identity, never by country; changing ruler removes the former ruler's image.
Unknown people receive compact initial placeholders rather than fabricated portraits.

## Cartography
Scenario coordinates are unchanged. The former stretched raster relief is not downloaded by the preview. SVG paths use a higher projection precision. Shared province edges are deduplicated; ownership changes update the mesh and colored atlas outlines. Border strokes use screen units. Labels declutter generically, independent of country names.
Natural Earth major river lines and named mountain-region extents form a light engraved treatment. This is not a DEM or a newly reconstructed province dataset; underlying jagged coordinates cannot be recovered through style alone.
A geographical graticule and an authored compass complete the printed atlas treatment.

## Newspaper
Domestic articles precede foreign coverage. Each section has a lead; desktop layouts use columns, phone layouts use one column and a compact masthead. An optional expanded reading mode increases paper width.
Article text and confirmed effects are passed through from the existing newsroom. Execution summary is folded into a detail. Nothing is invented or removed by the presentation module.
Gallery screenshot copy is an explicitly artificial layout fixture, not live AI campaign output.

## Assets and isolation
Historical artworks: public-domain reproductions listed in `assets/atlas/credits.json`.
Old Standard TT and Source Sans 3: SIL OFL; licenses shipped locally. Exact downloaded font blobs verified against SHA.
Art is resized and converted to WebP with Sharp; no generative image editing.
The preview uses separate `gs_atlas189_save_` save slots and map preferences, and suppresses cloud writes so experimental saves do not replace production saves. Auth and AI access keep their existing rules.
Original v18 available separately.

## Validation
Playwright Chromium checks desktop 1440×900 and landscape touch 844×390. Actual pointer zoom/drag, CDP touch pinch, fullscreen, country switch, successor image removal, real population, caption containment, order queuing, economics navigation, reader toggle, original geometry and isolated saves.
Paid endpoints blocked; tests assert no attempted AI function calls, no uncaught errors and no missing same-origin resources.
This is browser emulation, not a physical Android test. No live turn generation was required for this visual-only change.
