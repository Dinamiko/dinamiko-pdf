<?php
/**
 * "Download PDF" button: automatic placement and shortcode.
 *
 * @package Dinamiko\DinamikoPdf
 */

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\Button;

use Dinamiko\DinamikoPdf\Export\PrintEndpoint;
use Dinamiko\DinamikoPdf\Settings\Settings;
use Inpsyde\Modularity\Properties\Properties;
use WP_Post;

/**
 * Adds the button before or after the content of enabled post types and provides [dinamiko_pdf_button].
 * The "PDF Button" block (ButtonBlock module) renders through render() too.
 */
class Button {

	public const SHORTCODE = 'dinamiko_pdf_button';
	public const BLOCK     = 'dinamiko-pdf/button';
	public const HANDLE    = 'dinamiko-pdf-button';

	private const BUILD_DIR = 'modules/Button/build/';

	/**
	 * Constructor.
	 *
	 * @param Settings      $settings       Settings.
	 * @param PrintEndpoint $print_endpoint Print endpoint.
	 * @param Properties    $properties     Plugin properties.
	 */
	public function __construct(
		private Settings $settings,
		private PrintEndpoint $print_endpoint,
		private Properties $properties
	) {
	}

	/**
	 * Register (not enqueue) the button script and style; they are enqueued when a button renders.
	 */
	public function register_assets(): void {
		$asset_file = $this->properties->basePath() . self::BUILD_DIR . 'index.asset.php';
		if ( ! is_readable( $asset_file ) ) {
			return;
		}
		$asset = require $asset_file;

		wp_register_script(
			self::HANDLE,
			$this->properties->baseUrl() . self::BUILD_DIR . 'index.js',
			$asset['dependencies'],
			$asset['version'],
			[ 'in_footer' => true ]
		);
		wp_add_inline_script(
			self::HANDLE,
			'window.dinamikoPdfButton = ' . wp_json_encode(
				[
					'working' => __( 'Preparing PDF…', 'dinamiko-pdf' ),
					'done'    => __( 'PDF downloaded', 'dinamiko-pdf' ),
					'failed'  => __( 'Opening print dialog…', 'dinamiko-pdf' ),
				]
			) . ';',
			'before'
		);

		wp_register_style( self::HANDLE, false, [], $this->properties->version() );
		wp_add_inline_style(
			self::HANDLE,
			'.dinamiko-pdf-button-wrap{margin-block:1.5em}.dinamiko-pdf-button{cursor:pointer}.dinamiko-pdf-button[aria-busy="true"]{cursor:progress;opacity:.75}'
		);
	}

	/**
	 * Add the button before or after the main post content of enabled post types.
	 *
	 * @param string $content Content.
	 * @return string
	 */
	public function append( string $content ): string {
		if (
			$this->print_endpoint->is_active()
			|| is_admin()
			|| is_feed()
			|| ! is_singular()
			|| ! in_the_loop()
			|| ! is_main_query()
		) {
			return $content;
		}
		$post = get_post();
		if ( ! $post instanceof WP_Post || get_queried_object_id() !== $post->ID ) {
			return $content;
		}
		$settings = $this->settings->get();
		if ( ! in_array( $post->post_type, $settings['post_types'], true ) ) {
			return $content;
		}
		// A post that places its own button (shortcode or block) doesn't get a second one.
		if ( has_shortcode( $post->post_content, self::SHORTCODE ) || has_block( self::BLOCK, $post ) ) {
			return $content;
		}
		$button = $this->render( $post );
		return 'before' === $settings['button_position'] ? $button . $content : $content . $button;
	}

	/**
	 * Shortcode callback.
	 *
	 * @param array<string, string>|string $atts Attributes.
	 * @return string
	 */
	public function shortcode( array|string $atts ): string {
		if ( $this->print_endpoint->is_active() ) {
			return '';
		}
		$atts = shortcode_atts(
			[
				'label'  => '',
				'id'     => 0,
				'action' => '',
			],
			$atts,
			self::SHORTCODE
		);
		$post = $atts['id'] ? get_post( (int) $atts['id'] ) : get_post();
		return $post instanceof WP_Post ? $this->render( $post, (string) $atts['label'], (string) $atts['action'] ) : '';
	}

	/**
	 * Button markup. Uses core button block classes so themes style it.
	 *
	 * @param WP_Post $post   Post.
	 * @param string  $label  Optional label.
	 * @param string  $action `download` or `view`; empty uses the setting.
	 * @return string Markup, or an empty string while the post's password is required.
	 */
	public function render( WP_Post $post, string $label = '', string $action = '' ): string {
		// The print page isn't available until the visitor has entered the password.
		if ( post_password_required( $post ) ) {
			return '';
		}

		wp_enqueue_script( self::HANDLE );
		wp_enqueue_style( self::HANDLE );

		$settings = $this->settings->get();
		if ( ! in_array( $action, Settings::BUTTON_ACTIONS, true ) ) {
			$action = (string) $settings['button_action'];
		}
		// A label from the shortcode or block wins, then the "Button text" setting.
		if ( '' === $label ) {
			$label = trim( (string) $settings['button_label'] );
		}
		if ( '' === $label ) {
			$label = 'view' === $action ? __( 'View PDF', 'dinamiko-pdf' ) : __( 'Download PDF', 'dinamiko-pdf' );
		}

		return sprintf(
			'<div class="dinamiko-pdf-button-wrap wp-block-buttons"><div class="wp-block-button"><button type="button" class="dinamiko-pdf-button wp-block-button__link wp-element-button" data-dinamiko-pdf-url="%1$s" data-dinamiko-pdf-action="%2$s">%3$s</button></div></div>',
			esc_url( $this->print_endpoint->url( $post ) ),
			esc_attr( $action ),
			esc_html( $label )
		);
	}
}
