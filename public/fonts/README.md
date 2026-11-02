# Fonts

Self-hosted web fonts for the menu designer (the font list in `models/fonts.ts`). They are the Latin
subsets of the Fontsource packages (`@fontsource/*` and `@fontsource-variable/*`, version 5.x), copied here
so the print view doesn't depend on a CDN. Licences are in `licenses/`: every family is under the SIL Open
Font License 1.1 except Roboto Slab (Apache 2.0).

`board/*.woff` are static regular and bold (and italic) Latin files of the same families, from the Fontsource
packages' non-variable builds, for the menu board: it is drawn with pdfkit, which can't embed WOFF2 or variable
fonts. `FiraSans-Regular.ttf` is the font the board was first drawn with and is still what Fira Sans regular is drawn with on the board.

To add a family: copy its `*-latin-*.woff2` files and its LICENSE here, then add an entry to `models/fonts.ts`. To make it available on the
board too, copy its `*-latin-{400,700}-{normal,italic}.woff` files into `board/` and add `boardFiles`.
