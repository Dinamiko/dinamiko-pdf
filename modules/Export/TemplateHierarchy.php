<?php
/**
 * Print template lookup order.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Export;

/**
 * Builds the list of theme template names for the print page, most specific first,
 * like WordPress does for single-{post_type}-{slug}.php.
 */
final class TemplateHierarchy {

	public const DIRECTORY = 'content-pdf';

	/**
	 * Template names relative to the theme directory, most specific first.
	 *
	 * @param string $post_type Post type.
	 * @param string $post_name Post slug (may be empty or URL-encoded).
	 * @param int    $post_id   Post ID.
	 * @return string[]
	 */
	public static function candidates( string $post_type, string $post_name, int $post_id ): array {
		$dir        = self::DIRECTORY;
		$candidates = [];

		if ( '' !== $post_type ) {
			$slug = urldecode( $post_name );
			if ( '' !== $slug ) {
				$candidates[] = "{$dir}/print-{$post_type}-{$slug}.php";
				// Core also tries the encoded slug for non-ASCII names.
				if ( $slug !== $post_name ) {
					$candidates[] = "{$dir}/print-{$post_type}-{$post_name}.php";
				}
			}
			if ( $post_id > 0 ) {
				$candidates[] = "{$dir}/print-{$post_type}-{$post_id}.php";
			}
			$candidates[] = "{$dir}/print-{$post_type}.php";
		}

		$candidates[] = "{$dir}/print.php";

		return $candidates;
	}
}
