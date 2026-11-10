# Content PDF

Lets visitors download any post, page or custom post type as a PDF. The PDF is generated in the visitor's browser by the bundled [dompdf.js](https://github.com/lmn1919/dompdf.js), with no external services.

## How it works

A "Download PDF" button loads a content-only version of the post (`?cpdf_print=1`) in a hidden frame. That page renders the post content with the theme's styles at the PDF content width. dompdf.js then turns the computed layout into a vector PDF with selectable text. Core blocks (columns, galleries, tables, quotes, groups and so on) and theme.json styles look the same as on screen.

The print page supports both block themes and classic themes:

- **Block themes**: the content is wrapped in `.wp-site-blocks` / `.entry-content.is-layout-constrained`, and the title uses `.wp-block-post-title`.
- **Classic themes**: the content uses the common classic structure (`#page.site`, `main.site-main`, `article`, `.entry-header .entry-title`, `.entry-content`).

The theme's header, footer and sidebars are removed. The plugin replaces the font (see the limitations), the page background (white paper by default) and the page width (paper width minus margins).

If the browser cannot run the exporter, the plugin opens the browser's print dialog on the same content-only page instead. This happens when the browser has no Web Workers or WebAssembly, when a strict CSP blocks them, or when the export fails.

## Usage

- **Settings → Content PDF**: choose the post types that get the button automatically, the paper size (A4/Letter), the margins, and the footer text (placeholders `${currentPage}` and `${totalPages}`).
- **Shortcode**: `[content_pdf_button]`. Optional attributes: `label="…"`, and `id="123"` to export another post.
- Add the CSS class `cpdf-page-break` to any block to start it on a new page.
- Open `https://example.com/any-post/?cpdf_print=1` to export directly, or add `&cpdf_mode=print` to get the print dialog instead.
- A theme can supply its own `content-pdf/print.php` template. Keep the `.cpdf-article` element, because that is what gets exported.

## Hooks

| Hook | Type | Purpose |
| --- | --- | --- |
| `cpdf_modules` | filter | Add Modularity modules (e.g. premium add-ons) before the plugin boots. |
| `cpdf_hidden_selectors` | filter | CSS selectors hidden on the print page (share buttons, related posts, comment forms). |
| `cpdf_show_title` | filter | Whether the print page shows the post title (default `true`). |
| `cpdf_keep_theme_background` | filter | Keep the theme's page background instead of white. |
| `cpdf_print_template` | filter | Path of the print page template. |
| `cpdf_export_config` | filter | Config passed to the exporter (paper, margins, footer, fonts, filename). |
| `cpdf_engine` | filter | Replace the PDF engine (an `Dinamiko\ContentPdf\Export\Engine\Engine`). |
| `cpdf_dequeue_scripts` | filter | Script handles removed from the print page (by default, scripts loaded from the theme). |
| `cpdf_print_enqueue` | action | Add CSS/JS to the print page. A script can push functions `( article, helpers )` to `window.cpdfHooks.beforeExport`. They run before the export and may return a Promise. |

## Privacy

The print page uses the normal WordPress query, so drafts and private posts are only available to users who are allowed to read them. It sends `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`.

## Known limitations

- **Fonts**: the PDF uses the bundled Noto Sans (Regular and Bold) for all text, because dompdf.js only embeds the fonts it is given. Latin, Greek and Cyrillic are covered. Italic text is slanted synthetically.
- **Cross-origin images** (CDNs) need CORS headers, or they may be missing from the PDF.
- **Content Security Policy**: a strict CSP must allow `worker-src blob:` and `script-src 'wasm-unsafe-eval'`. Without them, the plugin falls back to the print dialog.
- Iframes, videos and embeds are replaced with a link.
- The export script works around a few bugs in dompdf.js 2.0.6: hidden elements, CSS background images, and spaces after inline elements. List markers are forced to discs.

## Development

See `CLAUDE.md` for commands and architecture. With wp-env running, `npm run demo:seed` fills the local site with demo content (core blocks, theme and synced patterns, templates) and `npm run demo:clean` removes it. To update the vendored dompdf.js, change the version in `package.json`, then run `npm install && npm run copy-vendor`.

## Credits

- dompdf.js, MIT licence (`modules/Export/assets/vendor/dompdf/LICENSE`). It is not related to the PHP library Dompdf.
- Noto Sans, SIL Open Font License 1.1 (`modules/Export/assets/fonts/OFL.txt`).
