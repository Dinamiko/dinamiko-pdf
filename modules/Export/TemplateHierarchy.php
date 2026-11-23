<?php
/**
 * Print template lookup order.
 *
 * @package Dinamiko\DinamikoPdf
 */

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\Export;

/**
 * Builds the list of theme template names for the print page (and its header/footer),
 * most specific first, like WordPress does for single-{post_type}-{slug}.php.
 */
final class TemplateHierarchy {

	public const DIRECTORY = 'dinamiko-pdf';

	/**
	 * Template names that have their own hierarchy.
	 */
	public const NAMES = [ 'print', 'header', 'footer' ];

	/**
	 * Template names relative to the theme directory, most specific first.
	 *
	 * @param string $post_type Post type.
	 * @param string $post_name Post slug (may be empty or URL-encoded).
	 * @param int    $post_id   Post ID.
	 * @param string $name      Template name: `print`, `header` or `footer`.
	 * @return string[]
	 */
	public static function candidates( string $post_type, string $post_name, int $post_id, string $name = 'print' ): array {
		$dir        = self::DIRECTORY;
		$name       = in_array( $name, self::NAMES, true ) ? $name : 'print';
		$candidates = [];

		if ( '' !== $post_type ) {
			$slug = urldecode( $post_name );
			if ( '' !== $slug ) {
				$candidates[] = "{$dir}/{$name}-{$post_type}-{$slug}.php";
				// Core also tries the encoded slug for non-ASCII names.
				if ( $slug !== $post_name ) {
					$candidates[] = "{$dir}/{$name}-{$post_type}-{$post_name}.php";
				}
			}
			if ( $post_id > 0 ) {
				$candidates[] = "{$dir}/{$name}-{$post_type}-{$post_id}.php";
			}
			$candidates[] = "{$dir}/{$name}-{$post_type}.php";
		}

		$candidates[] = "{$dir}/{$name}.php";

		return $candidates;
	}
}
