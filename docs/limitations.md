# Known limitations

The PDF is created in the browser by [dompdf.js](https://github.com/lmn1919/dompdf.js) 2.0.6, which reads the computed layout of the print page. That keeps the server free and the content private, but it has a few limits.

## Fonts

All text uses the fonts selected in the settings, because dompdf.js only embeds the fonts it is given: one for body text and, optionally, one for headings. The bundled default is **Noto Sans** (Regular and Bold). With a block theme, fonts uploaded to the WordPress Font Library with TTF files can be selected too. Classic themes have no Font Library screen, so their fonts are registered with the `dinamiko_pdf_fonts` filter, for example in a small must-use plugin. See [Adding fonts](user-guide.md#adding-fonts) for both, and the [developer guide](developer-guide.md#fonts) for the filter. Font sizes, weights, colors and spacing come from the theme. The theme's own typefaces don't, unless you register their TTF files.

- Noto Sans covers Latin, Greek and Cyrillic.
- Noto Sans doesn't cover CJK, Arabic, Hebrew, Devanagari, Thai or emoji, so those characters may be missing. Register a font that covers them.
- Italic text is slanted synthetically unless the font has an italic file registered. Noto Sans doesn't.
- WOFF and WOFF2 files aren't supported, only TTF. Font Library families that only have WOFF/WOFF2 files aren't listed.
- A variable TTF is embedded at its default instance, so it has no real bold.

## Images

- Images from another domain (a CDN, an external URL) need CORS headers (`Access-Control-Allow-Origin`). Without them they may be missing from the PDF.
- Lazy loading is turned off on the print page. The exporter waits up to 15 seconds for images.
- CSS background images are converted into images before the export.

## Content Security Policy

dompdf.js uses a Web Worker and WebAssembly. A strict CSP must allow `worker-src blob:` and `script-src 'wasm-unsafe-eval'`. Without them, the plugin opens the print dialog instead.

## Embeds and media

Iframes, videos, audio and embeds (YouTube, Vimeo, maps and so on) can't play on paper. They are replaced with a link box that points to the original, using the video poster when there is one.

## Layout workarounds

The export script works around these dompdf.js 2.0.6 bugs. The results can differ slightly from the screen:

- Elements hidden with `visibility: hidden` are made transparent (they keep their space), and hidden `::before`/`::after` text is dropped.
- Spaces after inline elements (links, code, bold text) are moved so they aren't lost.
- Drop caps (`::first-letter`) are recreated as a real element with the same styles.
- Headings are kept with the paragraph that follows them, and small boxes with a background or border are kept on one page.
- List markers are always discs.
- `dinamiko-pdf-page-break` on an element that also can't be split (a heading or figure) makes the page break win. Otherwise dompdf.js adds blank pages.

## Fallback to the print dialog

The print dialog opens on the content-only page instead of a download when:

- the browser has no Web Workers or WebAssembly,
- a Content Security Policy blocks them, or
- the export fails or takes longer than 2 minutes.

The visitor can still choose "Save as PDF" in the dialog.

## Page builders

Content that a page builder renders with its own front-end JavaScript may not appear as it does on screen. Page-builder support belongs in add-on modules (see `dinamiko_pdf_modules` in the [developer guide](developer-guide.md)).
