# Fonts

Self-hosted web fonts for the menu designer (the font list in `models/fonts.ts`). They are the Latin
subsets of the Fontsource packages (`@fontsource/*` and `@fontsource-variable/*`, version 5.x), copied here
so the print view doesn't depend on a CDN. Licences are in `licenses/`: every family is under the SIL Open
Font License 1.1 except Roboto Slab (Apache 2.0).

`FiraSans-Regular.ttf` is the menu board's font (read by pdfkit from `dist/public/fonts`).

To add a family: copy its `*-latin-*.woff2` files and its LICENSE here, then add an entry to `models/fonts.ts`.
