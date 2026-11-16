# User guide

Content PDF adds a "Download PDF" button to your posts, pages and custom post types. The PDF is created in the visitor's browser, uses your theme's styles and leaves out menus, sidebars and footers.

## Installation

1. Go to **Plugins → Add New**, search for "Content PDF", then click **Install Now** and **Activate**.
2. Go to **Settings → Content PDF**, choose where the button appears and save.
3. Open a post. The "Download PDF" button sits at the end of the content.

Requirements: WordPress 6.8 or later, PHP 8.1 or later.

<!-- SCREENSHOT: docs/images/button-on-post.png. Where: front end, demo post "Core text blocks". Setup: Twenty Twenty-Five, default settings, `npm run demo:seed`. Show: the end of the post content with the "Download PDF" button. -->

## Settings

**Settings → Content PDF**. Only administrators (`manage_options`) can change them. The values are stored in the `cpdf_settings` option.

<!-- SCREENSHOT: docs/images/settings-page.png. Where: wp-admin → Settings → Content PDF. Setup: default settings. Show: the whole page, from "Show button on" to "Hide the header and footer on the first page". -->

### Button and page

| Setting | Default | Values | What it does |
| --- | --- | --- | --- |
| Show button on | Posts | Any public post type | Post types that get the button automatically at the end of the content. Leave all unchecked to use only the shortcode. |
| Button action | Download the PDF | Download / Open in a new tab | **Download** creates the PDF in a hidden frame and downloads it. **Open in a new tab** shows the PDF in the browser's viewer, with a download link. |
| Paper size | A4 | A4, Letter | PDF page size. |
| Page margins (mm) | 15 | 0 to 50 | Margin on all four sides. The content width is the paper width minus the margins. |
| Show the post title | On | On/Off | Prints the post title above the content. |
| Show the featured image | Off | On/Off | Prints the featured image below the title, at the full content width. |
| PDF font | Noto Sans | Registered fonts | Typeface for all text, including the header and footer. Developers can register more fonts with the `cpdf_fonts` filter. |
| Heading font | Same as the PDF font | Registered fonts | Typeface for the post title and the headings (h1–h6), for themes that use a different font for headings. |

### Header and footer

Every PDF page can have a header and a footer, each with a left, center and right slot.

| Setting | Default | Values |
| --- | --- | --- |
| Header logo | none | PNG or JPEG from the media library. Drawn at the left of the header and scaled down if it doesn't fit in the top margin. |
| Logo height (px) | 48 | 8 to 120 |
| Header left / center / right | empty / empty / `{title}` | Text with placeholders |
| Footer left / center / right | `{site}` / empty / `Page ${currentPage} / ${totalPages}` | Text with placeholders |
| Header spacing (mm) | 8 | 0 to 40. Extra header height on top of the page margin. The content starts lower by the same amount. |
| Header font size (px) | 16 | 6 to 24 |
| Footer font size (px) | 10 | 6 to 24 |
| Text color | `#666666` | Any hex color |
| Hide the header and footer on the first page | Off | Useful when the first page works as a cover. |

Placeholders:

| Placeholder | Replaced with |
| --- | --- |
| `{title}` | Post title |
| `{site}` | Site title |
| `{date}` | Post date, in the site's date format |
| `{url}` | Post permalink |
| `${currentPage}` | Current page number |
| `${totalPages}` | Total number of pages |

Example: `{site} · {date}` on the left, `Page ${currentPage} of ${totalPages}` on the right.

<!-- SCREENSHOT: docs/images/pdf-header-footer.png. Where: the PDF of demo post "A long-form article with page breaks", page 2. Setup: logo set, header right `{title}`, footer left `{site}`, footer right `Page ${currentPage} / ${totalPages}`. Show: one full PDF page with header and footer visible. -->

## The shortcode

`[content_pdf_button]` adds a button wherever you place it: in a post, a page, a widget or a template part. When a post contains the shortcode, the automatic button is not added, so the button doesn't appear twice.

| Attribute | Default | Description |
| --- | --- | --- |
| `label` | "Download PDF" ("View PDF" in view mode) | Button text. |
| `id` | Current post | Export another post or page by ID. |
| `action` | The **Button action** setting | `download` or `view`. |

```text
[content_pdf_button]
[content_pdf_button label="Save this recipe as PDF"]
[content_pdf_button id="42" label="Download the price list"]
[content_pdf_button action="view"]
```

The button uses the core button classes (`wp-block-button__link wp-element-button`), so it looks like the theme's buttons.

## Page breaks

Add the CSS class `cpdf-page-break` to any block (**Block → Advanced → Additional CSS class(es)**) to start that block on a new page. In the classic editor, add `class="cpdf-page-break"` to the element in the text tab.

Content PDF also avoids common bad breaks on its own. Headings stay with the paragraph that follows them, and small boxes with a background or border aren't split across pages.

## Direct URLs

Every exportable post has a print URL, which you can use in links or menus:

| URL | Result |
| --- | --- |
| `https://example.com/my-post/?cpdf_print=1` | Downloads the PDF. |
| `https://example.com/my-post/?cpdf_print=1&cpdf_mode=view` | Shows the PDF in the tab, with a download link. |
| `https://example.com/my-post/?cpdf_print=1&cpdf_mode=print` | Opens the browser's print dialog on the content-only page. |

These URLs work on any singular post, page or custom post type, even when it isn't in **Show button on**.

## What ends up in the PDF

- The post content, rendered by WordPress (`the_content`), with the theme's styles and the block styles. This covers block themes and classic themes, core blocks, synced patterns, theme patterns and shortcodes.
- Optionally, the title and the featured image.
- Not included: the site header, navigation, sidebars, footer, comments, share buttons and related posts.
- Videos, audio, iframes and embeds become a link to the original.
- Text is real, selectable text in the selected fonts (Noto Sans by default). See [Known limitations](limitations.md).

If the browser can't create the PDF (very old browsers, a strict Content Security Policy, or an error), the print dialog opens instead, so the visitor can still "Save as PDF".

## Privacy

- The PDF is created in the visitor's browser. No content is sent to a third-party service, and there are no API keys or accounts.
- The print page uses the normal WordPress query, so drafts and private posts are only available to people allowed to read them. Everyone else gets a 404.
- Password-protected posts show no button, and their print URL shows the normal password form, until the visitor has entered the password. After that, the PDF works as usual. Its title (and file name) keeps WordPress's "Protected:" prefix, as on the page.
- The print page sends `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`, so search engines don't index it and caches don't store it.
