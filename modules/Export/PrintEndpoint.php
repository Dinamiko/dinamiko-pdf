<?php
/**
 * The content-only print page at ?cpdf_print=1.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Export;

use Dinamiko\ContentPdf\Export\Engine\Engine;
use Dinamiko\ContentPdf\Settings\Settings;
use Inpsyde\Modularity\Properties\Properties;
use WP_Post;

/**
 * Outputs a minimal HTML document containing only the post content, styled by the theme,
 * and hands it to the PDF engine.
 */
class PrintEndpoint {

	public const QUERY_VAR = 'cpdf_print';

	/**
	 * True while the print page is being rendered.
	 *
	 * @var bool
	 */
	private bool $active = false;

	/**
	 * Constructor.
	 *
	 * @param Settings   $settings   Settings.
	 * @param Engine     $engine     Default PDF engine.
	 * @param Properties $properties Plugin properties.
	 */
	public function __construct(
		private Settings $settings,
		private Engine $engine,
		private Properties $properties
	) {
	}

	/**
	 * Whether the current request renders the print page.
	 *
	 * @return bool
	 */
	public function is_active(): bool {
		return $this->active;
	}

	/**
	 * Print URL for a post.
	 *
	 * @param int|WP_Post|null $post Post.
	 * @return string
	 */
	public function url( int|WP_Post|null $post = null ): string {
		return add_query_arg( self::QUERY_VAR, '1', (string) get_permalink( $post ) );
	}

	/**
	 * Detect a print request early and set up flags that must exist before other code runs.
	 * Rendering happens at the end of `template_redirect`, so plugins that set themselves up
	 * there (page builders, redirects, maintenance mode) run first.
	 */
	public function detect(): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only view.
		if ( empty( $_GET[ self::QUERY_VAR ] ) || ! is_singular() ) {
			return;
		}

		// The main query already enforced visibility; drafts/private posts 404 before this point.
		$this->active = true;

		show_admin_bar( false );
		add_filter( 'wp_lazy_loading_enabled', '__return_false' );
		add_filter( 'should_load_block_assets_on_demand', '__return_false' );
		add_filter( 'should_load_separate_core_block_assets', '__return_false' );

		if ( ! headers_sent() ) {
			header( 'X-Robots-Tag: noindex, nofollow' );
			header( 'Cache-Control: private, no-store' );
		}

		add_action( 'template_redirect', [ $this, 'render' ], PHP_INT_MAX );
	}

	/**
	 * Render the print page and exit.
	 */
	public function render(): void {
		the_post();
		$post = get_post();
		if ( ! $post instanceof WP_Post ) {
			return;
		}

		// Render before wp_head(): block CSS and per-block global styles are enqueued during rendering.
		$content = apply_filters( 'the_content', $post->post_content ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core hook.

		// Emoji images come from a CDN (cross-origin); keep real glyphs instead.
		remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
		remove_action( 'wp_print_styles', 'print_emoji_styles' );
		remove_action( 'wp_enqueue_scripts', 'wp_enqueue_emoji_styles' );
		remove_action( 'wp_footer', 'wp_print_speculation_rules' );

		// The template prints its own <title> (the post title, used as the PDF filename).
		remove_action( 'wp_head', '_wp_render_title_tag', 1 );
		add_action( 'wp_enqueue_scripts', [ $this, 'enqueue' ], 999 );
		add_action( 'wp_print_scripts', [ $this, 'dequeue_theme_scripts' ], 999 );
		add_action( 'wp_print_footer_scripts', [ $this, 'dequeue_theme_scripts' ], 1 );
		// In wp_footer, so theme print templates (which must call wp_footer()) get the regions too.
		add_action( 'wp_footer', [ $this, 'render_regions' ], 1 );

		$title          = get_the_title( $post );
		$geometry       = $this->settings->geometry();
		$is_block_theme = wp_is_block_theme();
		$settings       = $this->settings->get();

		/**
		 * Whether the print page shows the post title above the content.
		 *
		 * @param bool    $show Default from the `show_title` setting.
		 * @param WP_Post $post Post being exported.
		 */
		$show_title = (bool) apply_filters( 'cpdf_show_title', (bool) $settings['show_title'], $post );

		/**
		 * Whether the print page shows the featured image above the content.
		 *
		 * @param bool    $show Default from the `show_featured_image` setting.
		 * @param WP_Post $post Post being exported.
		 */
		$show_featured_image = (bool) apply_filters( 'cpdf_show_featured_image', (bool) $settings['show_featured_image'], $post );
		$featured_image      = $show_featured_image && has_post_thumbnail( $post ) ? get_the_post_thumbnail( $post, 'large' ) : '';

		$body_classes = [ 'cpdf-print' ];

		/**
		 * Keep the theme's page background instead of white paper.
		 *
		 * @param bool    $keep Default false.
		 * @param WP_Post $post Post being exported.
		 */
		if ( apply_filters( 'cpdf_keep_theme_background', false, $post ) ) {
			$body_classes[] = 'cpdf-theme-background';
		}

		$template = locate_template( $this->template_candidates( $post ) );

		/**
		 * Filters the print page template path.
		 *
		 * @param string  $template Absolute path.
		 * @param WP_Post $post     Post being exported.
		 */
		$template = (string) apply_filters(
			'cpdf_print_template',
			$template ? $template : __DIR__ . '/templates/print.php',
			$post
		);

		include $template;
		exit;
	}

	/**
	 * Theme template names for the print page (or its header/footer), most specific first:
	 * content-pdf/{name}-{post_type}-{slug}.php, {name}-{post_type}-{id}.php,
	 * {name}-{post_type}.php, {name}.php.
	 *
	 * @param WP_Post $post Post being exported.
	 * @param string  $name Template name: `print`, `header` or `footer`.
	 * @return string[]
	 */
	public function template_candidates( WP_Post $post, string $name = 'print' ): array {
		$candidates = TemplateHierarchy::candidates( $post->post_type, $post->post_name, $post->ID, $name );

		/**
		 * Filters the theme template names tried for the print page, most specific first.
		 *
		 * @param string[] $candidates Paths relative to the theme directory.
		 * @param WP_Post  $post       Post being exported.
		 * @param string   $name       Template name: `print`, `header` or `footer`.
		 */
		return array_values(
			array_filter(
				(array) apply_filters( 'cpdf_print_template_hierarchy', $candidates, $post, $name ),
				'is_string'
			)
		);
	}

	/**
	 * Output the header and footer markup. It is never displayed: the exporter reads the slots
	 * and the logo from it and draws them on every PDF page.
	 */
	public function render_regions(): void {
		$post = get_post();
		if ( ! $post instanceof WP_Post ) {
			return;
		}

		$settings = $this->settings->get();
		$values   = $this->placeholder_values( $post );
		$labels   = [ 'left', 'center', 'right' ];

		// Slot style defaults from the settings; templates and theme CSS can override them.
		printf(
			'<div class="cpdf-regions" aria-hidden="true" style="%s">',
			esc_attr(
				sprintf(
					'--cpdf-header-font-size:%dpx;--cpdf-footer-font-size:%dpx;--cpdf-region-color:%s',
					(int) $settings['header_font_size'],
					(int) $settings['footer_font_size'],
					(string) $settings['hf_color']
				)
			)
		);
		foreach ( Settings::REGION_SLOTS as $region => $keys ) {
			$slots = [];
			foreach ( $keys as $i => $key ) {
				$slots[ $labels[ $i ] ] = Placeholders::replace( (string) $settings[ $key ], $values );
			}
			$logo = 'header' === $region ? $this->logo( $settings ) : null;

			$template = locate_template( $this->template_candidates( $post, $region ) );

			/**
			 * Filters the header/footer template path.
			 *
			 * @param string  $template Absolute path.
			 * @param string  $region   `header` or `footer`.
			 * @param WP_Post $post     Post being exported.
			 */
			$template = (string) apply_filters(
				'cpdf_region_template',
				$template ? $template : __DIR__ . '/templates/' . $region . '.php',
				$region,
				$post
			);

			$this->include_region_template( $template, $post, $settings, $region, $slots, $logo );
		}
		echo '</div>';
	}

	/**
	 * Include a header/footer template with its variables in scope.
	 *
	 * @param string                    $template Absolute path.
	 * @param WP_Post                   $post     Post being exported.
	 * @param array<string, mixed>      $settings Settings.
	 * @param string                    $region   `header` or `footer`.
	 * @param array<string, string>     $slots    Slot texts (left, center, right), placeholders resolved.
	 * @param array<string, mixed>|null $logo     Logo (url, width, height, alt) or null.
	 */
	private function include_region_template( string $template, WP_Post $post, array $settings, string $region, array $slots, ?array $logo ): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter -- variables for the template.
		if ( '' !== $template && is_readable( $template ) ) {
			include $template;
		}
	}

	/**
	 * Values for the {title}, {site}, {date} and {url} placeholders.
	 *
	 * @param WP_Post $post Post being exported.
	 * @return array<string, string>
	 */
	public function placeholder_values( WP_Post $post ): array {
		$decode = static fn( string $text ): string => html_entity_decode( wp_strip_all_tags( $text ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );

		/**
		 * Filters the header/footer placeholder values.
		 *
		 * @param array<string, string> $values Values by placeholder name (title, site, date, url).
		 * @param WP_Post               $post   Post being exported.
		 */
		return (array) apply_filters(
			'cpdf_placeholder_values',
			[
				'title' => $decode( get_the_title( $post ) ),
				'site'  => $decode( (string) get_bloginfo( 'name' ) ),
				'date'  => (string) get_the_date( '', $post ),
				'url'   => (string) get_permalink( $post ),
			],
			$post
		);
	}

	/**
	 * The header logo from the settings.
	 *
	 * @param array<string, mixed> $settings Settings.
	 * @return array{url: string, width: int, height: int, alt: string}|null
	 */
	private function logo( array $settings ): ?array {
		$id  = (int) $settings['header_logo_id'];
		$src = $id ? wp_get_attachment_image_src( $id, 'large' ) : false;
		if ( ! $src ) {
			return null;
		}

		$height = (int) $settings['header_logo_height'];
		$width  = $src[2] > 0 ? (int) round( $height * $src[1] / $src[2] ) : $height;

		return [
			'url'    => (string) $src[0],
			'width'  => $width,
			'height' => $height,
			'alt'    => (string) get_post_meta( $id, '_wp_attachment_image_alt', true ),
		];
	}

	/**
	 * Enqueue print styles and the engine assets.
	 */
	public function enqueue(): void {
		$post = get_post();
		if ( ! $post instanceof WP_Post ) {
			return;
		}

		$settings = $this->settings->get();
		$geometry = $this->settings->geometry();
		$base_url = (string) $this->properties->baseUrl();

		// The file time busts browser caches when the CSS changes without a version bump.
		$css_file = $this->properties->basePath() . 'modules/Export/assets/css/print.css';
		wp_enqueue_style(
			'cpdf-print',
			$base_url . 'modules/Export/assets/css/print.css',
			[],
			$this->properties->version() . ( is_readable( $css_file ) ? '.' . filemtime( $css_file ) : '' )
		);

		/**
		 * Selectors hidden on the print page (share buttons, related posts, comment forms…).
		 *
		 * @param string[] $selectors CSS selectors.
		 */
		$hidden = apply_filters(
			'cpdf_hidden_selectors',
			[
				'.cpdf-button',
				'.sharedaddy',
				'.sd-sharing-enabled',
				'.jp-relatedposts',
				'#jp-relatedposts',
				'.wp-block-jetpack-sharing-buttons',
				'.addtoany_share_save_container',
				'.comment-respond',
				'#comments',
				'.wp-block-comments',
				'.wp-block-post-comments-form',
				'.related-posts',
				'.yarpp-related',
			]
		);
		$hidden = array_filter( array_map( 'wp_strip_all_tags', (array) $hidden ) );
		if ( $hidden ) {
			wp_add_inline_style( 'cpdf-print', implode( ',', $hidden ) . '{display:none!important}' );
		}

		wp_add_inline_style(
			'cpdf-print',
			sprintf(
				'@page{size:%1$s;margin:%2$spt}',
				'letter' === $geometry['format'] ? 'letter' : 'A4',
				$geometry['margin_pt']
			)
		);

		// get_the_title() is texturized and HTML-encoded ("&#8220;"); the PDF filename and metadata need plain text.
		$title    = html_entity_decode( wp_strip_all_tags( get_the_title( $post ) ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$filename = sanitize_file_name( $title );

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only view.
		$mode = isset( $_GET['cpdf_mode'] ) ? sanitize_key( wp_unslash( $_GET['cpdf_mode'] ) ) : '';

		$config = [
			'format'         => $geometry['format'],
			'marginPt'       => $geometry['margin_box'],
			'pagePt'         => $geometry['page_pt'],
			'contentWidthPx' => $geometry['content_px'],
			'pageHeightPx'   => $geometry['height_px'],
			'gutterPx'       => $geometry['gutter_px'],
			'regions'        => [
				// Fallbacks; slot styles are read from the header/footer markup.
				'fontSize'      => [
					'header' => (int) $settings['header_font_size'],
					'footer' => (int) $settings['footer_font_size'],
				],
				'color'         => (string) $settings['hf_color'],
				'fontFamily'    => 'CPDF Sans',
				'skipFirstPage' => (bool) $settings['hf_skip_first_page'],
				// Extra header height (mm → pt).
				'headerExtraPt' => round( (int) $settings['header_spacing_mm'] * 72 / 25.4, 2 ),
			],
			'filename'       => ( '' !== $filename ? $filename : 'document' ) . '.pdf',
			'title'          => $title,
			'author'         => get_the_author_meta( 'display_name', (int) $post->post_author ),
			// pdf: download; view: show the PDF in this tab; print: browser print dialog.
			'mode'           => in_array( $mode, [ 'print', 'view' ], true ) ? $mode : 'pdf',
			'fonts'          => [
				[
					'family' => 'CPDF Sans',
					'weight' => 400,
					'url'    => $base_url . 'modules/Export/assets/fonts/NotoSans-Regular.ttf',
				],
				[
					'family' => 'CPDF Sans',
					'weight' => 700,
					'url'    => $base_url . 'modules/Export/assets/fonts/NotoSans-Bold.ttf',
				],
			],
			'i18n'           => [
				'preparing' => __( 'Preparing PDF…', 'content-pdf' ),
				/* translators: 1: current page, 2: total pages */
				'rendering' => __( 'Rendering page %1$d of %2$d…', 'content-pdf' ),
				'done'      => __( 'PDF downloaded.', 'content-pdf' ),
				'failed'    => __( 'PDF export failed — opening the print dialog instead.', 'content-pdf' ),
				'download'  => __( 'Download PDF', 'content-pdf' ),
			],
		];

		/**
		 * Filters the export config passed to the engine.
		 *
		 * @param array   $config Config.
		 * @param WP_Post $post   Post being exported.
		 */
		$config = (array) apply_filters( 'cpdf_export_config', $config, $post );

		/**
		 * Filters the PDF engine.
		 *
		 * @param Engine $engine Engine instance.
		 */
		$engine = apply_filters( 'cpdf_engine', $this->engine );
		if ( ! $engine instanceof Engine ) {
			$engine = $this->engine;
		}
		$engine->enqueue_print_assets( $config );

		/**
		 * Fires after the print page assets are enqueued. Compatibility modules add CSS/JS here,
		 * e.g. a script that registers `window.cpdfHooks.beforeExport` functions.
		 *
		 * @param WP_Post $post   Post being exported.
		 * @param array   $config Export config.
		 */
		do_action( 'cpdf_print_enqueue', $post, $config );
	}

	/**
	 * Theme scripts expect their header/nav markup and may throw on the print page.
	 * Dequeue scripts loaded from the theme directories (filterable).
	 */
	public function dequeue_theme_scripts(): void {
		$scripts    = wp_scripts();
		$theme_urls = [ get_template_directory_uri(), get_stylesheet_directory_uri() ];
		$handles    = [];

		foreach ( $scripts->queue as $handle ) {
			$src = isset( $scripts->registered[ $handle ] ) ? (string) $scripts->registered[ $handle ]->src : '';
			foreach ( $theme_urls as $theme_url ) {
				if ( '' !== $src && str_starts_with( $src, $theme_url ) ) {
					$handles[] = $handle;
				}
			}
		}

		/**
		 * Script handles removed from the print page.
		 *
		 * @param string[] $handles Handles.
		 */
		foreach ( (array) apply_filters( 'cpdf_dequeue_scripts', array_unique( $handles ) ) as $handle ) {
			wp_dequeue_script( $handle );
		}
	}
}
