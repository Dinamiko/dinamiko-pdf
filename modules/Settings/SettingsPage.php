<?php
/**
 * Settings → Content PDF admin page.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Settings;

use Inpsyde\Modularity\Properties\Properties;

/**
 * Registers the options page and the REST-exposed setting. The page itself is a React app
 * (`modules/Settings/resources/js/`) that reads and writes the option through `/wp/v2/settings`.
 */
class SettingsPage {

	private const PAGE      = 'content-pdf';
	private const HOOK      = 'settings_page_content-pdf';
	private const HANDLE    = 'cpdf-settings';
	private const BUILD_DIR = 'modules/Settings/build/';
	private const ROOT_ID   = 'cpdf-settings-root';

	/**
	 * Constructor.
	 *
	 * @param Settings   $settings   Settings.
	 * @param Properties $properties Plugin properties.
	 */
	public function __construct(
		private Settings $settings,
		private Properties $properties
	) {
	}

	/**
	 * Add the options page.
	 */
	public function add_page(): void {
		add_options_page(
			__( 'Content PDF', 'content-pdf' ),
			__( 'Content PDF', 'content-pdf' ),
			'manage_options',
			self::PAGE,
			[ $this, 'render_page' ]
		);
	}

	/**
	 * Register the setting, exposed in the REST API so the settings app can load and save it.
	 *
	 * Runs on `init`, because REST requests do not fire `admin_init`.
	 */
	public function register(): void {
		register_setting(
			self::PAGE,
			Settings::OPTION,
			[
				'type'              => 'object',
				'sanitize_callback' => [ $this->settings, 'sanitize' ],
				'default'           => Settings::defaults(),
				'show_in_rest'      => [ 'schema' => Settings::schema() ],
			]
		);
	}

	/**
	 * Return the migrated, defaults-merged option from the REST API instead of the raw saved value.
	 *
	 * @param mixed  $value Value to return instead of the option, null to use the option.
	 * @param string $name  Setting name.
	 * @return mixed
	 */
	public function rest_value( mixed $value, string $name ): mixed {
		if ( Settings::OPTION !== $name ) {
			return $value;
		}

		// Drop post types the form does not offer (e.g. from a deactivated plugin): the form
		// validates the field against its choices, and a stale one would block every save.
		$settings               = $this->settings->get();
		$settings['post_types'] = array_values(
			array_intersect( (array) $settings['post_types'], $this->selectable_post_types() )
		);

		return $settings;
	}

	/**
	 * Post types the settings form offers: public ones, without attachments.
	 *
	 * @return string[]
	 */
	private function selectable_post_types(): array {
		return array_values( array_diff( get_post_types( [ 'public' => true ] ), [ 'attachment' ] ) );
	}

	/**
	 * Enqueue the settings app.
	 *
	 * @param string $hook_suffix Current admin page.
	 */
	public function enqueue_assets( string $hook_suffix ): void {
		if ( self::HOOK !== $hook_suffix ) {
			return;
		}
		$base_path  = $this->properties->basePath() . self::BUILD_DIR;
		$asset_file = $base_path . 'index.asset.php';
		if ( ! is_readable( $asset_file ) ) {
			return;
		}
		$asset    = require $asset_file;
		$base_url = $this->properties->baseUrl() . self::BUILD_DIR;

		wp_enqueue_media();
		wp_enqueue_style( 'wp-components' );
		if ( is_readable( $base_path . 'style-index.css' ) ) {
			wp_enqueue_style( self::HANDLE, $base_url . 'style-index.css', [ 'wp-components' ], $asset['version'] );
			wp_style_add_data( self::HANDLE, 'rtl', 'replace' );
		}
		wp_enqueue_script(
			self::HANDLE,
			$base_url . 'index.js',
			$asset['dependencies'],
			$asset['version'],
			[ 'in_footer' => true ]
		);
		wp_set_script_translations( self::HANDLE, 'content-pdf' );
		wp_add_inline_script(
			self::HANDLE,
			'window.cpdfSettings = ' . wp_json_encode( $this->bootstrap() ) . ';',
			'before'
		);
	}

	/**
	 * Render the page: a mount point for the settings app.
	 */
	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		printf(
			'<div class="wrap"><h1>%1$s</h1><div id="%2$s"></div></div>',
			esc_html( get_admin_page_title() ),
			esc_attr( self::ROOT_ID )
		);
	}

	/**
	 * Data the settings app needs that `/wp/v2/settings` does not provide.
	 *
	 * @return array<string, mixed>
	 */
	private function bootstrap(): array {
		$post_types = [];
		foreach ( get_post_types( [ 'public' => true ], 'objects' ) as $type ) {
			if ( 'attachment' === $type->name ) {
				continue;
			}
			$post_types[] = [
				'value' => $type->name,
				'label' => $type->labels->name,
			];
		}

		$logo_id  = (int) $this->settings->get()['header_logo_id'];
		$logo_src = $logo_id ? wp_get_attachment_image_src( $logo_id, 'medium' ) : false;

		return [
			'rootId'    => self::ROOT_ID,
			'option'    => Settings::OPTION,
			'postTypes' => $post_types,
			'papers'    => [
				[
					'value' => 'a4',
					'label' => 'A4',
				],
				[
					'value' => 'letter',
					'label' => 'US Letter',
				],
			],
			'limits'    => [
				'marginMax'        => Settings::MARGIN_MAX,
				'logoHeightMin'    => Settings::LOGO_HEIGHT_MIN,
				'logoHeightMax'    => Settings::LOGO_HEIGHT_MAX,
				'fontSizeMin'      => Settings::FONT_SIZE_MIN,
				'fontSizeMax'      => Settings::FONT_SIZE_MAX,
				'headerSpacingMax' => Settings::HEADER_SPACING_MAX,
			],
			'defaults'  => Settings::defaults(),
			'logoUrl'   => $logo_src ? $logo_src[0] : '',
		];
	}
}
