<?php
/**
 * Placeholders in header and footer texts.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Export;

/**
 * Replaces the post placeholders ({title}, {site}, {date}, {url}).
 *
 * The page placeholders `${currentPage}` and `${totalPages}` are left as they are: dompdf.js
 * resolves them on every page.
 */
final class Placeholders {

	/**
	 * Placeholder names resolved in PHP.
	 */
	public const NAMES = [ 'title', 'site', 'date', 'url' ];

	/**
	 * Replace `{name}` placeholders with their values. Unknown placeholders are kept.
	 *
	 * @param string                $text   Text with placeholders.
	 * @param array<string, string> $values Values by placeholder name.
	 * @return string
	 */
	public static function replace( string $text, array $values ): string {
		$pairs = [];
		foreach ( self::NAMES as $name ) {
			$pairs[ '{' . $name . '}' ] = (string) ( $values[ $name ] ?? '' );
		}

		// `${totalPages}` contains `{totalPages}`, which is not a known name, so it is never touched.
		return strtr( $text, $pairs );
	}
}
