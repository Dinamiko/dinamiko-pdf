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
	 * Header and footer text slots.
	 */
	public const REGION_SLOTS = [
		'header' => [ 'header_left', 'header_center', 'header_right' ],
		'footer' => [ 'footer_left', 'footer_center', 'footer_right' ],
	];

	/**
	 * Logo height limits in CSS px.
	 */
	public const LOGO_HEIGHT_MIN = 8;
	public const LOGO_HEIGHT_MAX = 120;

	/**
	 * Header/footer font size limits in px.
	 */
	public const FONT_SIZE_MIN = 6;
	public const FONT_SIZE_MAX = 24;

	/**
	 * Maximum extra header height in mm.
	 */
	public const HEADER_SPACING_MAX = 40;

	/**
	 * Default values.
	 *
	 * @return array<string, mixed>
	 */
	public static function defaults(): array {
		return [
			'post_types'         => [ 'post' ],
			'paper'              => 'a4',
			'margin_mm'          => 15,
			'header_logo_id'     => 0,
			'header_logo_height' => 48,
			'header_left'        => '',
			'header_center'      => '',
			'header_right'       => '{title}',
			'footer_left'        => '{site}',
			'footer_center'      => '',
			// Page placeholders are resolved by dompdf.js, not PHP.
			'footer_right'       => 'Page ${currentPage} / ${totalPages}',
			'header_spacing_mm'  => 8,
			'header_font_size'   => 16,
			'footer_font_size'   => 10,
			'hf_color'           => '#666666',
			'hf_skip_first_page' => false,
		];
	}

	/**
	 * Current settings merged with defaults.
	 *
	 * @return array<string, mixed>
	 */
	public function get(): array {
		$saved = get_option( self::OPTION, [] );
		return wp_parse_args( self::migrate( is_array( $saved ) ? $saved : [] ), self::defaults() );
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
	 * Map options saved by older versions to the current keys.
	 *
	 * Before the header/footer slots there was a single `footer_text`, centered, and no header.
	 *
	 * @param array<string, mixed> $saved Saved option.
	 * @return array<string, mixed>
	 */
	public static function migrate( array $saved ): array {
		if ( ! array_key_exists( 'footer_text', $saved ) ) {
			return $saved;
		}

		$has_slots = (bool) array_intersect_key(
			$saved,
			array_flip( array_merge( ...array_values( self::REGION_SLOTS ) ) )
		);
		if ( ! $has_slots ) {
			$saved['header_right']  = '';
			$saved['footer_left']   = '';
			$saved['footer_center'] = (string) $saved['footer_text'];
			$saved['footer_right']  = '';
		}
		unset( $saved['footer_text'] );

		return $saved;
	}

	/**
	 * Sanitize the option array.
	 *
	 * @param mixed $input Raw input.
	 * @return array<string, mixed>
	 */
	public function sanitize( mixed $input ): array {
		$input    = is_array( $input ) ? $input : [];
		$defaults = self::defaults();
		$public   = get_post_types( [ 'public' => true ] );

		$post_types = isset( $input['post_types'] ) ? array_map( 'sanitize_key', (array) $input['post_types'] ) : [];
		$paper      = isset( $input['paper'] ) ? sanitize_key( (string) $input['paper'] ) : $defaults['paper'];
		$margin     = isset( $input['margin_mm'] ) ? absint( $input['margin_mm'] ) : $defaults['margin_mm'];

		$logo_id = isset( $input['header_logo_id'] ) ? absint( $input['header_logo_id'] ) : 0;
		if ( $logo_id && ! wp_attachment_is_image( $logo_id ) ) {
			$logo_id = 0;
		}
		$logo_height = isset( $input['header_logo_height'] ) ? absint( $input['header_logo_height'] ) : $defaults['header_logo_height'];
		$spacing     = isset( $input['header_spacing_mm'] ) ? absint( $input['header_spacing_mm'] ) : $defaults['header_spacing_mm'];
		$color       = isset( $input['hf_color'] ) ? sanitize_hex_color( (string) $input['hf_color'] ) : '';

		$output = [
			'post_types'         => array_values( array_intersect( $post_types, $public ) ),
			'paper'              => isset( Geometry::PAPER_SIZES[ $paper ] ) ? $paper : $defaults['paper'],
			'margin_mm'          => min( 50, $margin ),
			'header_logo_id'     => $logo_id,
			'header_logo_height' => max( self::LOGO_HEIGHT_MIN, min( self::LOGO_HEIGHT_MAX, $logo_height ) ),
			'header_spacing_mm'  => min( self::HEADER_SPACING_MAX, $spacing ),
			'hf_color'           => $color ? $color : $defaults['hf_color'],
			'hf_skip_first_page' => ! empty( $input['hf_skip_first_page'] ),
		];

		foreach ( array_keys( self::REGION_SLOTS ) as $region ) {
			$key            = $region . '_font_size';
			$size           = isset( $input[ $key ] ) ? absint( $input[ $key ] ) : $defaults[ $key ];
			$output[ $key ] = max( self::FONT_SIZE_MIN, min( self::FONT_SIZE_MAX, $size ) );
		}

		foreach ( array_merge( ...array_values( self::REGION_SLOTS ) ) as $key ) {
			// Page placeholders survive sanitize_text_field(). Empty means the slot is unused.
			$output[ $key ] = isset( $input[ $key ] ) ? sanitize_text_field( (string) $input[ $key ] ) : '';
		}

		return $output;
	}
}
