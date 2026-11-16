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
	 * What the button does: download the PDF or open it in a new tab.
	 */
	public const BUTTON_ACTIONS = [ 'download', 'view' ];

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
	 * Maximum page margin in mm.
	 */
	public const MARGIN_MAX = 50;

	/**
	 * Default values.
	 *
	 * @return array<string, mixed>
	 */
	public static function defaults(): array {
		return [
			'post_types'          => [ 'post' ],
			'button_action'       => 'download',
			'paper'               => 'a4',
			'margin_mm'           => 15,
			'show_title'          => true,
			'show_featured_image' => false,
			// Slugs from the Fonts registry; an empty heading font means "same as the body font".
			'font_body'           => Fonts::DEFAULT,
			'font_heading'        => '',
			'header_logo_id'      => 0,
			'header_logo_height'  => 48,
			'header_left'         => '',
			'header_center'       => '',
			'header_right'        => '{title}',
			'footer_left'         => '{site}',
			'footer_center'       => '',
			// Page placeholders are resolved by dompdf.js, not PHP.
			'footer_right'        => 'Page ${currentPage} / ${totalPages}',
			'header_spacing_mm'   => 8,
			'header_font_size'    => 16,
			'footer_font_size'    => 10,
			'hf_color'            => '#666666',
			'hf_skip_first_page'  => false,
		];
	}

	/**
	 * JSON schema of the option, used by the REST API (`/wp/v2/settings`).
	 *
	 * The REST API validates against it before `sanitize()` runs, so it must accept every value
	 * `defaults()` and `sanitize()` produce.
	 *
	 * @return array<string, mixed>
	 */
	public static function schema(): array {
		$integer = static fn( int $min, int $max ): array => [
			'type'    => 'integer',
			'minimum' => $min,
			'maximum' => $max,
		];

		$properties = [
			'post_types'          => [
				'type'  => 'array',
				'items' => [ 'type' => 'string' ],
			],
			'button_action'       => [
				'type' => 'string',
				'enum' => self::BUTTON_ACTIONS,
			],
			'paper'               => [
				'type' => 'string',
				'enum' => array_keys( Geometry::PAPER_SIZES ),
			],
			'margin_mm'           => $integer( 0, self::MARGIN_MAX ),
			'show_title'          => [ 'type' => 'boolean' ],
			'show_featured_image' => [ 'type' => 'boolean' ],
			// No enum: the `cpdf_fonts` filter decides which slugs exist.
			'font_body'           => [ 'type' => 'string' ],
			'font_heading'        => [ 'type' => 'string' ],
			'header_logo_id'      => [
				'type'    => 'integer',
				'minimum' => 0,
			],
			'header_logo_height'  => $integer( self::LOGO_HEIGHT_MIN, self::LOGO_HEIGHT_MAX ),
			'header_spacing_mm'   => $integer( 0, self::HEADER_SPACING_MAX ),
			'header_font_size'    => $integer( self::FONT_SIZE_MIN, self::FONT_SIZE_MAX ),
			'footer_font_size'    => $integer( self::FONT_SIZE_MIN, self::FONT_SIZE_MAX ),
			'hf_color'            => [ 'type' => 'string' ],
			'hf_skip_first_page'  => [ 'type' => 'boolean' ],
		];
		foreach ( array_merge( ...array_values( self::REGION_SLOTS ) ) as $key ) {
			$properties[ $key ] = [ 'type' => 'string' ];
		}

		return [
			'type'                 => 'object',
			'additionalProperties' => false,
			'properties'           => $properties,
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
		$font_body   = isset( $input['font_body'] ) ? sanitize_key( (string) $input['font_body'] ) : '';

		$output = [
			'post_types'          => array_values( array_intersect( $post_types, $public ) ),
			'button_action'       => isset( $input['button_action'] ) && in_array( $input['button_action'], self::BUTTON_ACTIONS, true ) ? $input['button_action'] : $defaults['button_action'],
			'paper'               => isset( Geometry::PAPER_SIZES[ $paper ] ) ? $paper : $defaults['paper'],
			'margin_mm'           => min( self::MARGIN_MAX, $margin ),
			// A missing key keeps the title: only an explicit false hides it.
			'show_title'          => isset( $input['show_title'] ) ? (bool) $input['show_title'] : $defaults['show_title'],
			'show_featured_image' => ! empty( $input['show_featured_image'] ),
			// Unknown slugs fall back to the default font when the PDF is built (Fonts::resolve()).
			'font_body'           => '' !== $font_body ? $font_body : $defaults['font_body'],
			'font_heading'        => isset( $input['font_heading'] ) ? sanitize_key( (string) $input['font_heading'] ) : $defaults['font_heading'],
			'header_logo_id'      => $logo_id,
			'header_logo_height'  => max( self::LOGO_HEIGHT_MIN, min( self::LOGO_HEIGHT_MAX, $logo_height ) ),
			'header_spacing_mm'   => min( self::HEADER_SPACING_MAX, $spacing ),
			'hf_color'            => $color ? $color : $defaults['hf_color'],
			'hf_skip_first_page'  => ! empty( $input['hf_skip_first_page'] ),
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
