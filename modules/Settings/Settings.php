<?php
/**
 * Plugin settings stored in a single option.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Settings;

/**
 * Reads, defaults and sanitizes the `cpdf_settings` option.
 */
class Settings {

	public const OPTION = 'cpdf_settings';

	/**
	 * Default values.
	 *
	 * @return array{post_types: string[], paper: string, margin_mm: int, footer_text: string}
	 */
	public static function defaults(): array {
		return [
			'post_types'  => [ 'post' ],
			'paper'       => 'a4',
			'margin_mm'   => 15,
			// Placeholders are resolved by dompdf.js, not PHP.
			'footer_text' => 'Page ${currentPage} / ${totalPages}',
		];
	}

	/**
	 * Current settings merged with defaults.
	 *
	 * @return array{post_types: string[], paper: string, margin_mm: int, footer_text: string}
	 */
	public function get(): array {
		$saved = get_option( self::OPTION, [] );
		return wp_parse_args( is_array( $saved ) ? $saved : [], self::defaults() );
	}

	/**
	 * Page geometry derived from the current settings.
	 *
	 * @return array<string, mixed> See Geometry::from_settings().
	 */
	public function geometry(): array {
		return Geometry::from_settings( $this->get() );
	}

	/**
	 * Sanitize the option array.
	 *
	 * @param mixed $input Raw input.
	 * @return array{post_types: string[], paper: string, margin_mm: int, footer_text: string}
	 */
	public function sanitize( mixed $input ): array {
		$input    = is_array( $input ) ? $input : [];
		$defaults = self::defaults();
		$public   = get_post_types( [ 'public' => true ] );

		$post_types = isset( $input['post_types'] ) ? array_map( 'sanitize_key', (array) $input['post_types'] ) : [];
		$paper      = isset( $input['paper'] ) ? sanitize_key( (string) $input['paper'] ) : $defaults['paper'];
		$margin     = isset( $input['margin_mm'] ) ? absint( $input['margin_mm'] ) : $defaults['margin_mm'];

		return [
			'post_types'  => array_values( array_intersect( $post_types, $public ) ),
			'paper'       => isset( Geometry::PAPER_SIZES[ $paper ] ) ? $paper : $defaults['paper'],
			'margin_mm'   => min( 50, $margin ),
			'footer_text' => isset( $input['footer_text'] ) ? sanitize_text_field( (string) $input['footer_text'] ) : '',
		];
	}
}
