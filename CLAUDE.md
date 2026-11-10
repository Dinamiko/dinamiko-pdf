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
- Single e2e test: `npm run test:e2e -- tests/e2e/specs/sample.spec.js -g "admin notice"`
- First-time setup for e2e: `npx playwright install chromium`.
- No lint or static-analysis scripts are configured yet.

## Architecture

- **Bootstrap (`content-pdf.php`)**: on `plugins_loaded`, it loads `vendor/autoload.php`, builds a Modularity `Package` through the memoized `plugin()` function, adds the built-in modules plus any extra modules from the `cpdf_modules` filter, boots it, and stores the resulting PSR-11 container in the static `Dinamiko\ContentPdf\Container` (`modules/Container.php`). Code outside modules gets services through `Container::container()`, which throws if it is called before boot.
- **Modules (`modules/<Name>/Module.php`)**: each feature is a Modularity module, usually implementing `ServiceModule` (`services()` returns service factories) and `ExecutableModule` (`run()` registers WP hooks). `ModuleClassNameIdTrait` supplies the module ID. To add a module, create the class under `modules/` (PSR-4 `Dinamiko\ContentPdf\` → `modules/`) and register it with `->addModule()` in `plugin()`.
- **JS assets**: modules are self-contained. A module's JS entry point lives in `modules/<Name>/resources/js/index.js`, and `webpack.config.js` finds it automatically (one webpack config per module, because wp-scripts cleans the output path on every build). A build writes `modules/<Name>/build/index.js` and `index.asset.php`, which holds the dependencies and version. Modules enqueue scripts by reading that asset file through `Package::PROPERTIES` (`basePath()` / `baseUrl()`). See `modules/Sample/Module.php` for the pattern. Each module's `build/` is committed.
- **Prefixes**: hooks, filters, and script handles use `cpdf` (`cpdf_modules`, `cpdf-sample`). The text domain is `content-pdf`.
- **Tests**: unit tests go in `tests/unit/` (autoload-dev namespace `Dinamiko\ContentPdf\Tests\Unit\`). There is no `phpunit.xml`; the test path is passed on the command line.
- **E2E tests**: `tests/e2e/playwright.config.js` extends `@wordpress/scripts/config/playwright.config.js` and only overrides `testDir`. Specs import `test`/`expect` from `@wordpress/e2e-test-utils-playwright`, which provides fixtures such as `admin` and `requestUtils`. Global setup logs in as admin and saves the storage state, so specs start authenticated. Results, traces and failure screenshots go to `artifacts/`, which is gitignored.
- `modules/Container.php` has a stray plugin header that conflicts with the main file (Requires PHP 7.4, Version 0.1.0). The real header is the one in `content-pdf.php`.
