# Dinamiko PDF

A WordPress plugin that lets visitors download any post, page or custom post type as a PDF that looks like the site. The PDF is generated in the visitor's browser by the bundled [dompdf.js](https://github.com/lmn1919/dompdf.js), with no external services. Text stays real, selectable text.

- Works with block themes and classic themes, and keeps the look of core blocks and theme.json styles.
- Leaves out the site header, navigation, sidebars, footer, comments and share buttons.
- A4 or Letter, margins, title and featured image, and a header and footer with a logo, page numbers and placeholders.
- An automatic button or the `[dinamiko_pdf_button]` shortcode, which can download the PDF or open it in a new tab.
- Themes can supply their own print, header and footer templates, and plugins can extend the output through hooks.
- Falls back to the browser's print dialog when the browser can't create the PDF.
- Respects drafts, private and password-protected posts, and keeps PDF pages out of search engines.

<!-- SCREENSHOT: docs/images/hero.png. Where: a post and its PDF side by side. Setup: block demo (`npm run demo:seed`), post "Media and layout blocks". Show: the page on the left and the PDF on the right. -->

## Documentation

- [User guide](docs/user-guide.md)
- [Developer guide](docs/developer-guide.md): templates, hooks, add-ons
- [Known limitations](docs/limitations.md)
- [Testing](docs/testing.md)

## Quick start (development)

Requirements: PHP 8.1+, Composer, Node.js and Docker (for `wp-env`).

```bash
composer install
npm install
npm run build
npm run wp-env start     # http://localhost:8888 (admin / password)
npm run demo:seed        # block theme demo; npm run demo:seed:classic for the classic one
```

Or, without Docker: `npm run playground` (WordPress Playground on `http://127.0.0.1:9400`, demo included).

[`CLAUDE.md`](CLAUDE.md) lists every command and describes the architecture.

## Credits

- dompdf.js, MIT licence (`modules/Export/assets/vendor/dompdf/LICENSE`). It is not related to the PHP library Dompdf.
- Noto Sans, SIL Open Font License 1.1 (`modules/Export/assets/fonts/OFL.txt`).

## License

MIT
