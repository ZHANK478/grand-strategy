# Historical visual lab · 5 October 2026

Branch: `experiment/historical-visuals-20261005`, based on release v18 (`c088636af4b157f7dae8c61391de0915162cc210`).
Playable entry: `visual-lab.html`. Comparison: `visual-gallery.html`.

## Three treatments

| Style | Map | Interface |
| --- | --- | --- |
| Historical atlas | Warm muted country washes, ink labels, thin coasts, real mountain-region hatching and major rivers | Ivory paper, printed headings, burgundy accents |
| Political map | Flat country colours, no physical decoration, clear shared boundaries | Restrained green controls, simple surfaces |
| Ruler's cabinet | Muted colours, cooler river ink, cartographic physical detail | Dark green headings and HUD, light documents |

Themes are authored CSS and SVG; no new AI pictures, paid model calls or LoRA installations. Existing embedded PlayfairD and LoraG fonts are retained. Unknown portraits have a neutral illustrated placeholder rather than an invented likeness.

## Cartographic changes

The blurred raster relief is removed from the experimental renderer. The same original scenario polygons remain selectable; no smoothing, invented coastlines or province remapping. A shared-edge mesh paints each boundary once; ownership changes update country boundaries. Coast and country line widths remain screen-sized during zoom. Country-label preferred size is normalized to actual screen width; unreadably tiny or colliding labels yield to larger regions and return as zoom creates space, using the same rule for every country. The province-border visibility preference still works.

Overlapping mountain-region extents are drawn in a single compound path to avoid double-dark hatching. Real cartographic mountain regions and river centre lines use public-domain Natural Earth data. This is vector atlas notation, not a digital elevation model or new terrain imagery. Missing detail in the original scenario's coast geometry is not recovered by these treatments.

## Comparison and party isolation

The bottom switch also updates `?theme=atlas|political|cabinet`. It does not reset date, money, orders, diplomacy, map ownership or camera position. Themes share one game implementation, not three forks of the simulation.

Preview saves use `gs_visual_lab_save_` and map settings use `gs_visual_lab_`; the preview does not write production cloud-save slots. Authentication, paid turns and model access use the existing backend. No quota bypass is added. Main production root files remain at v18; only a prefixed preview snapshot is published.

## References

- [Levasseur, Europe 1852](https://commons.wikimedia.org/wiki/File:1852_Levasseur_Map_of_Europe_-_Geographicus_-_Europe-levasseur-1852.jpg), public domain.
- [Barbie du Bocage, Europe 1852](https://commons.wikimedia.org/wiki/File:1852_Barbie_du_Bocage_Map_of_Europe_-_Geographicus_-_Europe-bocage-1852.jpg), public domain.
- [Krüger, Friedrich Wilhelm IV in his cabinet, 1846](https://commons.wikimedia.org/wiki/File:1846_Krueger_Friedrich_Wilhelm_IV_anagoria.JPG), public domain.
- [Suzerain](https://www.suzeraingame.com/suzerain), interface reference only; no game assets copied.
- [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/), public domain; physical-data provenance is embedded in `visual-physical.json`.
- [OpenHistoricalMap](https://www.openhistoricalmap.org/copyright?locale=en-GB), researched as a possible future historical boundary source, not substituted for scenario boundaries.

## Verification

`tests/visual-lab.test.mjs` starts the real game in Chromium at 1440×900 desktop and 844×390 landscape touch viewport. It checks all three switches, unchanged game state and geometry, native fullscreen, foreign country selection, economy navigation, drag/wheel/pinch, screen-sized boundary strokes, border updates after temporary fixture ownership change, isolated saving and newspaper rendering. All model endpoints are blocked; it asserts zero attempted AI calls.

Screenshots capture the same scenario/view in all themes. Newspaper screenshots use an explicitly synthetic display fixture to compare typography without model spending. The workflow artifact and `visual-shots/report.json` record results. Browser emulation is not a claim of testing on a physical phone.
