# Fonts

The fonts the menu designs can use (the list is in `models/fonts.ts`). Both the print menu and the menu
board are drawn as PDFs with pdfkit, which can't embed WOFF2 or variable fonts, so these are static
regular and bold (and italic, where the family has one) Latin files, from the Fontsource packages'
non-variable builds. `board/*.woff` are those files (the folder's name dates from when only the board
used them); `FiraSans-Regular.ttf` is the font the board was first drawn with and is still what Fira Sans
regular is drawn with. The files are read by the server and embedded in the PDF; nothing serves them to
browsers. The "Standard" serif and sans-serif fonts have no files: they are the PDF viewer's own Times and
Helvetica.

Licences are in `licenses/`: every family is under the SIL Open Font License 1.1 except Roboto Slab
(Apache 2.0).

To add a family: copy its `*-latin-{400,700}-{normal,italic}.woff` files into `board/` and its LICENSE into
`licenses/` (named for the font's ID), then add an entry with `files: board(...)` to `models/fonts.ts`.
