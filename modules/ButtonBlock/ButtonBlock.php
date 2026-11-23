<?php
/**
 * "PDF Button" block: the [dinamiko_pdf_button] shortcode as a block.
 *
 * @package Dinamiko\DinamikoPdf
 */

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\ButtonBlock;

use Dinamiko\DinamikoPdf\Button\Button;
use Dinamiko\DinamikoPdf\Export\PrintEndpoint;
use Dinamiko\DinamikoPdf\Settings\Settings;
use Inpsyde\Modularity\Properties\Properties;
use WP_Block;
use WP_Block_Type;
use WP_Post;

/**
 * Registers the dynamic `dinamiko-pdf/button` block and renders it with Button::render().
 */
class ButtonBlock {

	/**
	 * Constructor.
	 *
	 * @param Button        $button         Button.
	 * @param PrintEndpoint $print_endpoint Print endpoint.
	 * @param Settings      $settings       Settings.
	 * @param Properties    $properties     Plugin properties.
	 */
	public function __construct(
		private Button $button,
		private PrintEndpoint $print_endpoint,
		private Settings $settings,
		private Properties $properties
	) {
	}

	/**
	 * Register the block from block.json. The editor script gets the default button action,
	 * so the preview shows the label the button will have.
	 */
	public function register(): void {
		$block_type = register_block_type(
			$this->properties->basePath() . 'modules/ButtonBlock',
			[ 'render_callback' => [ $this, 'render' ] ]
		);
		if ( ! $block_type instanceof WP_Block_Type ) {
			return;
		}
		$settings = $this->settings->get();
		foreach ( $block_type->editor_script_handles as $handle ) {
			wp_add_inline_script(
				$handle,
				'window.dinamikoPdfBlock = ' . wp_json_encode(
					[
						'action' => $settings['button_action'],
						'label'  => $settings['button_label'],
					]
				) . ';',
				'before'
			);
			wp_set_script_translations( $handle, 'dinamiko-pdf' );
		}
	}

	/**
	 * Render callback. Same behaviour as the shortcode: nothing on the print page, and the post is
	 * the `postId` attribute, else the block context (e.g. inside a Query Loop), else the current post.
	 *
	 * @param array<string, mixed> $attributes Block attributes.
	 * @param string               $content    Inner content (unused).
	 * @param WP_Block|null        $block      Block instance.
	 * @return string
	 */
	public function render( array $attributes, string $content = '', ?WP_Block $block = null ): string {
		if ( $this->print_endpoint->is_active() ) {
			return '';
		}

		$post_id = (int) ( $attributes['postId'] ?? 0 );
		if ( 0 === $post_id && $block instanceof WP_Block ) {
			$post_id = (int) ( $block->context['postId'] ?? 0 );
		}
		$post = $post_id ? get_post( $post_id ) : get_post();
		if ( ! $post instanceof WP_Post ) {
			return '';
		}

		// The label is edited as rich text: store plain text, Button::render() escapes it.
		$label = trim( html_entity_decode( wp_strip_all_tags( (string) ( $attributes['label'] ?? '' ) ), ENT_QUOTES, 'UTF-8' ) );

		return $this->button->render( $post, $label, (string) ( $attributes['action'] ?? '' ) );
	}
}
