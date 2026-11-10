# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Content PDF is a WordPress plugin (PHP 8.1+, namespace `Dinamiko\ContentPdf`) built on [inpsyde/modularity](https://github.com/inpsyde/modularity). JS assets are built with `@wordpress/scripts`; the local WordPress environment is `@wordpress/env` (PHP 8.4, configured in `.wp-env.json`, which also installs Plugin Check).

## Commands

- `composer install` / `npm install`: install dependencies. `vendor/` sits in the plugin directory, which wp-env mounts, so run `composer install` on the host.
- `npm run wp-env start` / `npm run wp-env stop`: start or stop the local WordPress (Docker).
- `npm run build`: production JS build into `build/`. `npm start` runs the watch build.
- `npm run test:php`: runs PHPUnit (`tests/unit`) inside the wp-env `tests-cli` container. wp-env must be running.
- Single test: `npm run wp-env run tests-cli --env-cwd=wp-content/plugins/content-pdf vendor/bin/phpunit tests/unit --filter test_name`
- `npm run test:e2e`: runs the Playwright e2e tests (`tests/e2e/specs`) in Chromium against the wp-env tests site (`http://localhost:8889`, override with `WP_BASE_URL`). wp-env is started automatically if it isn't running. Run `npm run build` first if JS changed, because the tests load `build/`. `npm run test:e2e:debug` opens the Playwright UI.
- Single e2e test: `npm run test:e2e -- tests/e2e/specs/export.spec.js -g "classic theme"`
- First-time setup for e2e: `npx playwright install chromium`.
- `npm run copy-vendor`: copies the dompdf.js browser build from `node_modules` into `modules/Export/assets/vendor/dompdf/` (committed). `dompdf.js` is pinned in `package.json` because the export JS works around bugs in that version.
- `npm run lint:php` (or `composer lint:php`): runs PHP_CodeSniffer with WordPress Coding Standards and PHPCompatibilityWP (PHP 8.1+) on the host. `npm run lint:php:fix` auto-fixes with phpcbf. Config is in `phpcs.xml.dist`.

## Architecture

- **Bootstrap (`content-pdf.php`)**: on `plugins_loaded`, it loads `vendor/autoload.php`, builds a Modularity `Package` through the memoized `plugin()` function, adds the built-in modules plus any extra modules from the `cpdf_modules` filter, boots it, and stores the resulting PSR-11 container in the static `Dinamiko\ContentPdf\Container` (`modules/Container.php`). Code outside modules gets services through `Container::container()`, which throws if it is called before boot.
- **Modules (`modules/<Name>/Module.php`)**: each feature is a Modularity module, usually implementing `ServiceModule` (`services()` returns service factories) and `ExecutableModule` (`run()` registers WP hooks). `ModuleClassNameIdTrait` supplies the module ID. To add a module, create the class under `modules/` (PSR-4 `Dinamiko\ContentPdf\` → `modules/`) and register it with `->addModule()` in `plugin()`.
- **JS assets**: modules are self-contained. A module's JS entry point lives in `modules/<Name>/resources/js/index.js`, and `webpack.config.js` finds it automatically (one webpack config per module, because wp-scripts cleans the output path on every build). A build writes `modules/<Name>/build/index.js` and `index.asset.php`, which holds the dependencies and version. Modules enqueue scripts by reading that asset file through `Package::PROPERTIES` (`basePath()` / `baseUrl()`). See `modules/Button/Button.php` (`register_assets()`) for the pattern. Each module's `build/` is committed.
- **Built-in modules**:
  - `Settings`: the `cpdf_settings` option (`Settings` service: `get()`, `sanitize()`, `geometry()`), the Settings → Content PDF page, and `Geometry::from_settings()`, which is pure and unit tested (paper size and margins → content width in px, gutter, dompdf `marginPt`).
  - `Export`: the print page. `PrintEndpoint::detect()` runs on `template_redirect` priority 1 when `?cpdf_print=1` is on a singular URL. `render()` runs at `PHP_INT_MAX`, applies `the_content`, and includes `templates/print.php`, which has a block-theme branch and a classic-theme branch (themes can override it with `content-pdf/print.php`). The `Engine` service (`BrowserEngine`) enqueues the vendored dompdf.js and the export script, and passes `window.cpdfConfig`. The export JS (`resources/js/`) waits for images, runs `window.cpdfHooks.beforeExport` hooks, applies the dompdf.js workarounds, and either downloads the PDF or posts the Blob to the parent frame. `?cpdf_mode=print` opens the print dialog instead.
  - `Button`: appends the "Download PDF" button to `the_content` for the enabled post types and provides `[content_pdf_button]`. Its JS loads the print page in an off-screen iframe and downloads the Blob.
- **Extension points (premium modules, e.g. page-builder support, live in separate repos and are added via `cpdf_modules`)**: filters `cpdf_hidden_selectors`, `cpdf_show_title`, `cpdf_keep_theme_background`, `cpdf_print_template`, `cpdf_export_config`, `cpdf_engine`, `cpdf_dequeue_scripts`. The action `cpdf_print_enqueue` adds CSS/JS to the print page, the JS hooks are `window.cpdfHooks.beforeExport`, and `$container->get( PrintEndpoint::class )->is_active()` tells whether the current request is the print page. Do not add page-builder (e.g. Elementor) code to this repo.
- **Coding standards**: PHP follows the WordPress ruleset (snake_case methods and variables, docblocks on every file, class and method), with PSR-4 class files and short arrays.
- **Prefixes**: hooks, filters, and script handles use `cpdf` (`cpdf_modules`, `cpdf-button`). The text domain is `content-pdf`.
- **Tests**: unit tests go in `tests/unit/` (autoload-dev namespace `Dinamiko\ContentPdf\Tests\Unit\`). There is no `phpunit.xml`; the test path is passed on the command line.
- **E2E tests**: `tests/e2e/playwright.config.js` extends `@wordpress/scripts/config/playwright.config.js` and only overrides `testDir`. Specs import `test`/`expect` from `@wordpress/e2e-test-utils-playwright`, which provides fixtures such as `admin` and `requestUtils`. Global setup logs in as admin and saves the storage state, so specs start authenticated. Results, traces and failure screenshots go to `artifacts/`, which is gitignored.
