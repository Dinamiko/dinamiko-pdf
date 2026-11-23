# Testing

Run everything here before a release. The automated suites need the local WordPress (`npm run wp-env start`, Docker).

## Automated checks

| Check | Command | Covers |
| --- | --- | --- |
| PHP coding standards | `npm run lint:php` | WordPress Coding Standards, PHP 8.1+ compatibility. |
| JS build | `npm run build` | The committed `modules/*/build/` must not change afterwards (`git status`). |
| Unit tests | `npm run test:php` | `Geometry`, `Placeholders`, settings schema and migration, `TemplateHierarchy`. |
| End-to-end tests | `npm run test:e2e` | Button, shortcode and PDF Button block, print page in block and classic themes, download and view modes, page breaks, title/featured image settings, template hierarchy, password-protected posts, settings REST validation. |
| Plugin Check | `npm run dist`, then `mkdir -p dist/check && unzip -qo dist/dinamiko-pdf.zip -d dist/check && npm run wp-env run cli -- wp plugin check /var/www/html/wp-content/plugins/dinamiko-pdf/dist/check/dinamiko-pdf` | wordpress.org requirements, on the release zip (not the working copy, which has dev files). Expected: "Checks complete. No errors found." |

Run `npm run build` before the e2e tests if the JS changed, because the tests load `build/`. To run a single test: `npm run test:e2e -- tests/e2e/specs/export.spec.js -g "classic theme"`.

## Demo content

The demo builds a set of posts and pages on the dev site (`http://localhost:8888`), with a front page that links to each item, its PDF and its print dialog. There are two versions:

| Command | Theme | Content |
| --- | --- | --- |
| `npm run demo:seed` | Twenty Twenty-Five (block) | Core blocks, classic-editor HTML, shortcodes, theme patterns, a full-page pattern with the "Page No Title" template, synced patterns and a custom block template. |
| `npm run demo:seed:classic` | Twenty Twenty-One (classic) | Only what a classic site has: core blocks, classic-editor HTML and shortcodes. No patterns or block templates. |

Each seed replaces the other one. `npm run demo:clean` removes the demo content and restores the settings and front page. Demo links use `?p=ID` / `?page_id=ID`, so they keep working when you change the permalink structure.

In WordPress Playground (`npm run playground`) the block demo is seeded, and Twenty Twenty-One is installed so you can switch to it.

## Manual QA checklist

Run it in a real browser (Chrome, Firefox and Safari if possible) on both demos. Open each downloaded PDF.

### Block theme demo (`npm run demo:seed`)

- [ ] The front page lists the items in two groups, "Also in the classic demo" and "Block theme demo only", and every link opens.
- [ ] Every "download PDF" link downloads a PDF named after the post.
- [ ] The PDFs contain only the content: no site header, navigation or footer, including "Business home" (Page No Title template) and "Event landing" (custom template).
- [ ] Columns, galleries, cover blocks, tables, quotes and pattern sections look like the page.
- [ ] "A long-form article with page breaks": each `dinamiko-pdf-page-break` block starts a new page, with no blank pages.
- [ ] "Embeds, video and audio": every embed is a link box to the original.
- [ ] "Typography and languages": Latin, Greek and Cyrillic text renders. Other scripts are expected to be missing (see [limitations](limitations.md)).
- [ ] "Synced patterns": the contact card and disclaimer are in the PDF.
- [ ] Text in the PDF can be selected and searched.

### Classic theme demo (`npm run demo:seed:classic`)

- [ ] Twenty Twenty-One is active, and the front page lists only the items that work with any theme.
- [ ] Every PDF downloads. The content uses Twenty Twenty-One's styles (title, links, tables), and the masthead, menu and footer are absent.
- [ ] "Classic editor content (no blocks)": paragraphs, lists, the captioned image and the table render, and the `dinamiko-pdf-page-break` heading starts a new page.

### Button, shortcode and block

- [ ] The "Download PDF" button appears at the end of posts and pages (both are enabled by the demo) and shows progress while it works.
- [ ] "Shortcode buttons" page: the custom label works, and `id="…"` downloads the other post.
- [ ] **Button action → Open the PDF in a new tab**: the button opens a tab that shows the PDF, and its download link saves it with the right name. Allow pop-ups if the browser asks.
- [ ] `[dinamiko_pdf_button action="view"]` and `action="download"` override the setting.
- [ ] With a post type unchecked in **Show button on**, its posts have no automatic button.
- [ ] "Shortcode buttons" page, **PDF Button block** section: the block's custom label works, and the view block opens the media post in a new tab.
- [ ] In the editor, the **PDF Button** block shows the default label as a placeholder, and the label, **Button action** and **Post ID** settings are saved. A post with the block has no automatic button.

### Settings

- [ ] Paper: A4 and Letter produce the right page size (Document Properties in the PDF viewer).
- [ ] Margins: 0 and 50 mm change the content width.
- [ ] Show the post title off: no title in the PDF. Show the featured image on: the image appears below the title.
- [ ] Header logo (PNG and JPEG) appears at the left of the header and is scaled to the logo height.
- [ ] Header and footer slots show `{title}`, `{site}`, `{date}`, `{url}`, `${currentPage}` and `${totalPages}` correctly on every page.
- [ ] Header spacing, font sizes and text color change the header and footer.
- [ ] Hide the header and footer on the first page works.
- [ ] Invalid values (margin 99, a bad color) are rejected, and reloading the page shows the saved values.

### Direct URLs and fallback

- [ ] `?dinamiko_pdf_print=1` downloads, `&dinamiko_pdf_mode=view` shows the PDF in the tab, and `&dinamiko_pdf_mode=print` opens the print dialog.
- [ ] Block `modules/Export/assets/vendor/dompdf/` in DevTools (Network → Block request URL) and click the button: the print dialog opens instead.

### Privacy

- [ ] Logged out, `?dinamiko_pdf_print=1` on a draft or private post returns a 404.
- [ ] A password-protected post shows no button and its print URL shows the password form. After entering the password, the button appears and the PDF downloads.
- [ ] `curl -sI 'http://localhost:8888/?p=ID&dinamiko_pdf_print=1' -L` shows `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`.

### Clean-up and logs

- [ ] `npm run demo:clean` removes the demo and restores the front page and settings.
- [ ] `npm run wp-env run cli cat wp-content/debug.log` has no notices, warnings or deprecations from `dinamiko-pdf`.
- [ ] No errors in the browser console on posts and on the print page.
