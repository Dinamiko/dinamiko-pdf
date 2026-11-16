# Developer guide

How Content PDF works, and how themes and plugins can change its output.

## How the export works

1. The button (or a link) loads the post's **print page**: its permalink with `?cpdf_print=1`. The button loads it in an off-screen iframe. In view mode (`cpdf_mode=view`) it opens in a new tab.
2. `PrintEndpoint::detect()` (on `template_redirect`, priority 1) recognises the request. `PrintEndpoint::render()` (at `PHP_INT_MAX`, so other plugins' `template_redirect` code runs first) renders the post content through `the_content` and includes the print template. The template is a content-only HTML document that keeps the theme and block styles.
3. The export script waits for fonts and images, runs the `beforeExport` hooks, fixes the DOM for dompdf.js, and turns the `.cpdf-article` element into a vector PDF with [dompdf.js](https://github.com/lmn1919/dompdf.js) (bundled in `modules/Export/assets/vendor/dompdf/`).
4. The PDF is downloaded, posted back to the page that opened it (button), or shown in the tab (view mode). If anything fails, the browser's print dialog opens instead.

The print page never runs for drafts or private posts the visitor can't read (the main query returns a 404), or for password-protected posts until the visitor has entered the password.

## Custom print templates

Themes can replace the print page. Content PDF uses the first file that exists, checking the child theme and then the parent theme:

1. `content-pdf/print-{post_type}-{slug}.php`, e.g. `print-post-hello-world.php`
2. `content-pdf/print-{post_type}-{id}.php`, e.g. `print-page-42.php`
3. `content-pdf/print-{post_type}.php`, e.g. `print-product.php`
4. `content-pdf/print.php`
5. The plugin default, `modules/Export/templates/print.php`

Start by copying the default template. It is a complete HTML document and must keep:

- an element with the class `cpdf-article` and the width style shown below. Only this element is exported.
- `wp_head()` and `wp_footer()`. They load the exporter, the theme and block styles, and the header/footer regions.
- `<p class="cpdf-status">` (optional), which shows the export progress.

Variables available in the template:

| Variable | Type | Description |
| --- | --- | --- |
| `$post` | `WP_Post` | The post being exported. Use it for custom fields, the author, terms and so on. |
| `$content` | `string` | The post content after `the_content`. |
| `$title` | `string` | The post title (`get_the_title()`). |
| `$show_title` | `bool` | The **Show the post title** setting, after the `cpdf_show_title` filter. |
| `$featured_image` | `string` | Featured image markup, or `''` when it is turned off or missing. |
| `$geometry` | `array` | Page geometry: `format`, `page_pt`, `margin_pt`, `margin_box`, `content_px`, `gutter_px`, `height_px`. |
| `$is_block_theme` | `bool` | Whether the active theme is a block theme. |
| `$body_classes` | `string[]` | Extra body classes (`cpdf-print`, and `cpdf-theme-background` when that filter is on). |

```php
<?php
defined( 'ABSPATH' ) || exit;
$cpdf_width = sprintf( '--cpdf-content-width: %dpx; --cpdf-gutter: %dpx', (int) $geometry['content_px'], (int) $geometry['gutter_px'] );
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<title><?php echo esc_html( wp_strip_all_tags( $title ) ); ?></title>
	<?php wp_head(); ?>
</head>
<body <?php body_class( $body_classes ); ?>>
	<p class="cpdf-status" role="status" aria-live="polite"></p>
	<article class="entry-content cpdf-article" style="<?php echo esc_attr( $cpdf_width ); ?>">
		<h1><?php echo wp_kses_post( $title ); ?></h1>
		<?php echo $featured_image; ?>
		<p>Price: <?php echo esc_html( get_post_meta( $post->ID, 'price', true ) ); ?></p>
		<?php echo $content; ?>
	</article>
	<?php wp_footer(); ?>
</body>
</html>
```

The `<title>` is used as the PDF's title metadata. The file name comes from the post title.

### Header and footer templates

The PDF header and footer are drawn on every page from hidden markup that the exporter reads. They use the same hierarchy with `header` or `footer` in place of `print` (`content-pdf/footer-{post_type}.php`, `content-pdf/header.php` and so on). The defaults are `modules/Export/templates/header.php` and `footer.php`.

- Keep the wrapper with `data-cpdf-region="header"` or `data-cpdf-region="footer"`.
- Each non-empty `[data-cpdf-slot="left|center|right"]` becomes one line of plain text, styled with the element's computed color, font size, weight and style. Inline markup is flattened.
- In the header, `img.cpdf-region-logo` is drawn at the left, at its `width` and `height`.
- `${currentPage}` and `${totalPages}` are replaced on every page.

Variables: `$post`, `$settings` (plugin settings), `$region` (`header` or `footer`), `$slots` (slot texts with `{placeholders}` already replaced), and `$logo` in the header (`url`, `width`, `height`, `alt`, or `null`).

## PHP hooks

| Hook | Type | Arguments | Purpose |
| --- | --- | --- | --- |
| `cpdf_modules` | filter | `Module[] $modules` | Add [Modularity](https://github.com/inpsyde/modularity) modules (add-ons) before the plugin boots. |
| `cpdf_show_title` | filter | `bool $show, WP_Post $post` | Show the post title on the print page. Default: the setting. |
| `cpdf_show_featured_image` | filter | `bool $show, WP_Post $post` | Show the featured image. Default: the setting. |
| `cpdf_keep_theme_background` | filter | `bool $keep, WP_Post $post` | Keep the theme's page background instead of white paper. Default `false`. |
| `cpdf_hidden_selectors` | filter | `string[] $selectors` | CSS selectors hidden on the print page. Defaults cover the button, comments, Jetpack/AddToAny sharing and related posts. |
| `cpdf_print_template_hierarchy` | filter | `string[] $candidates, WP_Post $post, string $name` | Theme template names tried, most specific first. `$name` is `print`, `header` or `footer`. |
| `cpdf_print_template` | filter | `string $template, WP_Post $post` | Absolute path of the print template, after the theme lookup. |
| `cpdf_region_template` | filter | `string $template, string $region, WP_Post $post` | Absolute path of the header or footer template. |
| `cpdf_placeholder_values` | filter | `array $values, WP_Post $post` | Values of `{title}`, `{site}`, `{date}` and `{url}`. |
| `cpdf_export_config` | filter | `array $config, WP_Post $post` | Config passed to the exporter: paper, margins, regions, `filename`, `title`, `author`, `mode`, `fonts`, `i18n`. |
| `cpdf_engine` | filter | `Engine $engine` | Replace the PDF engine (a `Dinamiko\ContentPdf\Export\Engine\Engine`). |
| `cpdf_dequeue_scripts` | filter | `string[] $handles` | Script handles removed from the print page. Default: scripts loaded from the theme directories. |
| `cpdf_print_enqueue` | action | `WP_Post $post, array $config` | Add CSS or JS to the print page. |

Examples:

```php
// Hide an extra element in the PDF.
add_filter( 'cpdf_hidden_selectors', function ( array $selectors ): array {
	$selectors[] = '.newsletter-signup';
	return $selectors;
} );

// No title on pages.
add_filter( 'cpdf_show_title', function ( bool $show, WP_Post $post ): bool {
	return 'page' === $post->post_type ? false : $show;
}, 10, 2 );

// Custom file name.
add_filter( 'cpdf_export_config', function ( array $config, WP_Post $post ): array {
	$config['filename'] = 'acme-' . $post->post_name . '.pdf';
	return $config;
}, 10, 2 );

// Show the last-modified date for {date} in the header/footer.
add_filter( 'cpdf_placeholder_values', function ( array $values, WP_Post $post ): array {
	$values['date'] = get_the_modified_date( 'Y-m-d', $post );
	return $values;
}, 10, 2 );
```

Only `{title}`, `{site}`, `{date}` and `{url}` are replaced. For other data (author, custom fields), use a custom header/footer template, which receives `$post`.

## JavaScript hooks

Scripts added through `cpdf_print_enqueue` can register `beforeExport` functions. Each one receives the exported element and a set of helpers. It may return a Promise. A hook that throws or takes longer than 10 seconds is logged and skipped, so it never blocks the export.

```php
add_action( 'cpdf_print_enqueue', function () {
	wp_enqueue_script( 'my-cpdf-compat', plugins_url( 'compat.js', __FILE__ ), [], '1.0', true );
} );
```

```js
// compat.js
window.cpdfHooks = window.cpdfHooks || {};
( window.cpdfHooks.beforeExport = window.cpdfHooks.beforeExport || [] ).push(
	async ( article, { embedPlaceholder, waitForImages, config } ) => {
		// Replace a custom map widget with a link.
		article.querySelectorAll( '.my-map' ).forEach( ( el ) => {
			el.replaceWith( embedPlaceholder( el.dataset.url, 'Map' ) );
		} );
		// Wait for images added by the hook.
		await waitForImages( article, 5000 );
	}
);
```

Helpers: `embedPlaceholder( url, title, posterUrl )` returns a link box element, `waitForImages( root, timeoutMs )` resolves when images have loaded, and `config` is the export config.

## Detecting the print page

```php
use Dinamiko\ContentPdf\Container;
use Dinamiko\ContentPdf\Export\PrintEndpoint;

if ( Container::container()->get( PrintEndpoint::class )->is_active() ) {
	// This request renders the print page.
}
```

`Container::container()` throws if it is called before the plugin boots (`plugins_loaded`). On the front end, `is_active()` is reliable from `template_redirect` priority 2 onwards.

## Add-on modules

Premium or custom integrations (for example, page-builder support) live in separate plugins and add [Modularity](https://github.com/inpsyde/modularity) modules through `cpdf_modules`:

```php
add_filter( 'cpdf_modules', function ( array $modules ): array {
	$modules[] = new My\Addon\Module();
	return $modules;
} );
```

The filter runs on `plugins_loaded`, before the plugin boots, so add it from your plugin's main file. Modules can use the plugin's services (`Settings`, `PrintEndpoint`, `Engine`) through the container.

## Development

Commands and architecture notes live in [`CLAUDE.md`](../CLAUDE.md). The [testing guide](testing.md) covers the test suites and the demo content.
