# Releasing to wordpress.org

## 1. Prepare

- [ ] Every check in the [testing guide](testing.md) passes.
- [ ] `Version:` in `dinamiko-pdf.php` matches `Stable tag:` in `readme.txt` (`npm run dist` fails otherwise).
- [ ] `Tested up to:` in `readme.txt` is the current WordPress version.
- [ ] `readme.txt` has a changelog entry for the version.
- [ ] `readme.txt` passes the [readme validator](https://wordpress.org/plugins/developers/readme-validator/).

## 2. Build the zip

```bash
npm run dist
```

This builds the JS and creates `dist/dinamiko-pdf.zip` with a single `dinamiko-pdf/` folder. The zip contains only the main plugin file, `readme.txt`, `composer.json`, `modules/` (including the readable JS sources in `resources/`, which wordpress.org requires next to the minified builds), `bin/demo-content/` (the Live Preview seeds from it) and the production `vendor/`. `docs/`, tests and dev tooling are left out.

## 3. Plugin Check

Run [Plugin Check](https://wordpress.org/plugins/plugin-check/) on the release build, not on the working copy (which has dev files):

```bash
mkdir -p dist/check && unzip -qo dist/dinamiko-pdf.zip -d dist/check
npm run wp-env run cli -- wp plugin check /var/www/html/wp-content/plugins/dinamiko-pdf/dist/check/dinamiko-pdf
```

The expected result is "Checks complete. No errors found."

## 4. Submit (first release only)

Upload `dist/dinamiko-pdf.zip` at [wordpress.org/plugins/developers/add](https://wordpress.org/plugins/developers/add/). The review team replies by email. Once the plugin is approved, you get SVN access.

## 5. Publish in SVN

```text
trunk/                     ← contents of the zip's dinamiko-pdf/ folder
tags/0.1.0/                ← copy of trunk
assets/
    banner-772x250.png
    banner-1544x500.png
    icon-128x128.png
    icon-256x256.png
    screenshot-1.png
    screenshot-2.png
    screenshot-3.png
    blueprints/blueprint.json   ← .wordpress-org/blueprints/blueprint.json
```

The screenshots have to match the captions in `readme.txt` (`== Screenshots ==`):

<!-- SCREENSHOT: assets/screenshot-1.png. Caption: "The "Download PDF" button on a blog post." Where: front end, demo post "Core text blocks". Setup: block demo (`npm run demo:seed`), default settings, browser around 1280 px wide. Show: the end of the post with the button, plus some content above it. -->

<!-- SCREENSHOT: assets/screenshot-2.png. Caption: "The PDF keeps your theme's look: columns, images, tables and quotes." Where: the PDF of demo post "Media and layout blocks", opened in the browser's PDF viewer. Setup: block demo, logo and default header/footer. Show: one or two pages with columns, a gallery and the header/footer. -->

<!-- SCREENSHOT: assets/screenshot-3.png. Caption: "Settings: content types, paper, margins, header and footer." Where: wp-admin → Settings → Dinamiko PDF. Setup: default settings plus a logo. Show: the whole settings page. -->

<!-- SCREENSHOT: assets/banner-772x250.png, banner-1544x500.png, icon-128x128.png, icon-256x256.png. Plugin directory banner and icon (design assets, not screen captures). -->

## 6. Live Preview

The wordpress.org "Live Preview" button opens the plugin in WordPress Playground with `assets/blueprints/blueprint.json`. That blueprint installs the plugin from the directory, installs Twenty Twenty-One and runs the block demo seeder. Keep it in sync with `bin/playground/blueprint.json`, which you can test locally with `npm run playground`.

After uploading the blueprint, enable the preview for everyone in the plugin's **Advanced** view on wordpress.org. Until then, only committers see it.

## Later releases

1. Bump `Version:` in `dinamiko-pdf.php` and `Stable tag:` in `readme.txt`, and add a changelog entry.
2. Repeat steps 1 to 3.
3. Update `trunk/` in SVN, copy it to `tags/<version>/`, and commit.
