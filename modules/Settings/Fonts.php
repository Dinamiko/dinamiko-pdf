<?php
/**
 * Registry of the fonts a PDF can use.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Settings;

/**
 * Bundled Noto Sans, the Font Library families that have TrueType files, and any families
 * registered through the `cpdf_fonts` filter.
 *
 * The PDF engine (dompdf.js) embeds only the TrueType files it is given, so every family lists
 * its TTF files with their weight and style.
 */
class Fonts {

	/**
	 * Slug of the bundled font, always available.
	 */
	public const DEFAULT = 'noto-sans';

	/**
	 * Memoized registry.
	 *
	 * @var array<string, array{label: string, files: list<array{url: string, weight: int, style: string}>}>|null
	 */
	private ?array $fonts = null;

	/**
	 * Constructor.
	 *
	 * @param string $base_url Plugin base URL, with a trailing slash.
	 */
	public function __construct( private string $base_url ) {
	}

	/**
	 * Every registered font, keyed by slug.
	 *
	 * @return array<string, array{label: string, files: list<array{url: string, weight: int, style: string}>}>
	 */
	public function all(): array {
		if ( null !== $this->fonts ) {
			return $this->fonts;
		}

		// The bundled font wins a slug clash with the Font Library.
		$fonts = [
			self::DEFAULT => self::bundled( $this->base_url ),
		] + self::from_library( $this->library_families() );

		/**
		 * Filters the fonts available for the PDF.
		 *
		 * Each entry is keyed by a slug and has a `label` and a list of TrueType `files`, each with a
		 * `url`, a `weight` (100–900, default 400) and a `style` (`normal` or `italic`). Register at
		 * least the 400 weight; add 700 so bold text is not drawn with the regular file. The URL must
		 * be same-origin or served with CORS headers, because the browser fetches it.
		 *
		 * @param array<string, array<string, mixed>> $fonts Fonts keyed by slug.
		 */
		$filtered = apply_filters( 'cpdf_fonts', $fonts );

		$this->fonts = self::normalize( is_array( $filtered ) ? $filtered : $fonts, self::bundled( $this->base_url ) );

		return $this->fonts;
	}

	/**
	 * A registered font, or the default one when the slug is unknown (e.g. the font was
	 * unregistered after it was selected).
	 *
	 * @param string $slug Font slug.
	 * @return array{label: string, files: list<array{url: string, weight: int, style: string}>}
	 */
	public function resolve( string $slug ): array {
		$fonts = $this->all();
		return $fonts[ $slug ] ?? $fonts[ self::DEFAULT ];
	}

	/**
	 * The bundled Noto Sans entry.
	 *
	 * @param string $base_url Plugin base URL, with a trailing slash.
	 * @return array{label: string, files: list<array{url: string, weight: int, style: string}>}
	 */
	public static function bundled( string $base_url ): array {
		$dir = $base_url . 'modules/Export/assets/fonts/';
		return [
			'label' => 'Noto Sans',
			'files' => [
				[
					'url'    => $dir . 'NotoSans-Regular.ttf',
					'weight' => 400,
					'style'  => 'normal',
				],
				[
					'url'    => $dir . 'NotoSans-Bold.ttf',
					'weight' => 700,
					'style'  => 'normal',
				],
			],
		];
	}

	/**
	 * Font Library families (`wp_font_family` posts) with their faces (`wp_font_face` posts).
	 *
	 * @return list<array{name: string, slug: string, faces: list<array<string, mixed>>}>
	 */
	private function library_families(): array {
		if ( ! post_type_exists( 'wp_font_family' ) ) {
			return [];
		}

		$families = get_posts(
			[
				'post_type'              => 'wp_font_family',
				'post_status'            => 'publish',
				'posts_per_page'         => 100,
				'orderby'                => 'title',
				'order'                  => 'ASC',
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
			]
		);
		if ( ! $families ) {
			return [];
		}

		$faces     = get_posts(
			[
				'post_type'              => 'wp_font_face',
				'post_status'            => 'publish',
				'post_parent__in'        => wp_list_pluck( $families, 'ID' ),
				'posts_per_page'         => 1000, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- faces of at most 100 families.
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
			]
		);
		$by_family = [];
		foreach ( $faces as $face ) {
			$settings = json_decode( $face->post_content, true );
			if ( is_array( $settings ) ) {
				$by_family[ $face->post_parent ][] = $settings;
			}
		}

		$output = [];
		foreach ( $families as $family ) {
			$settings = json_decode( $family->post_content, true );
			$output[] = [
				'name'  => $family->post_title,
				'slug'  => is_array( $settings ) && isset( $settings['slug'] ) ? (string) $settings['slug'] : $family->post_name,
				'faces' => $by_family[ $family->ID ] ?? [],
			];
		}

		return $output;
	}

	/**
	 * Registry entries for Font Library families. Pure, so it can be unit tested.
	 *
	 * Only TrueType sources are kept, because the PDF engine cannot embed WOFF/WOFF2. A face with a
	 * weight range (a variable font, e.g. "100 900") is registered as 400 when the range includes
	 * it, otherwise at its lowest weight. Families without a TTF face are left out.
	 *
	 * @param list<array{name: string, slug: string, faces: list<array<string, mixed>>}> $families Families, see library_families().
	 * @return array<string, array{label: string, files: list<array{url: string, weight: int, style: string}>}>
	 */
	public static function from_library( array $families ): array {
		$output = [];

		foreach ( $families as $family ) {
			$files = [];
			foreach ( $family['faces'] as $face ) {
				$srcs = isset( $face['src'] ) ? (array) $face['src'] : [];
				$ttf  = current(
					array_filter(
						$srcs,
						// The path ends in .ttf, before any query string or fragment.
						static fn( $src ): bool => is_string( $src ) && (bool) preg_match( '/\.ttf(?:[?#].*)?$/i', $src )
					)
				);
				if ( false === $ttf ) {
					continue;
				}
				$files[] = [
					'url'    => $ttf,
					'weight' => self::library_weight( $face['fontWeight'] ?? '400' ),
					'style'  => isset( $face['fontStyle'] ) && 'italic' === $face['fontStyle'] ? 'italic' : 'normal',
				];
			}

			$slug = (string) $family['slug'];
			if ( $files && '' !== $slug ) {
				$output[ $slug ] = [
					'label' => '' !== $family['name'] ? $family['name'] : $slug,
					'files' => $files,
				];
			}
		}

		return $output;
	}

	/**
	 * A single weight from a Font Library `fontWeight` ("400", "bold", "100 900").
	 *
	 * @param mixed $weight Font weight.
	 * @return int
	 */
	private static function library_weight( mixed $weight ): int {
		$weight = strtolower( trim( (string) $weight ) );
		if ( 'bold' === $weight ) {
			return 700;
		}
		if ( ! preg_match_all( '/\d+/', $weight, $matches ) ) {
			return 400;
		}
		$range = array_map( 'intval', $matches[0] );
		$min   = min( $range );
		$max   = max( $range );

		return ( $min <= 400 && 400 <= $max ) ? 400 : $min;
	}

	/**
	 * Validate filtered fonts. Pure, so it can be unit tested.
	 *
	 * Slugs are lowercased to `[a-z0-9_-]`, files without an http(s) or protocol-relative URL are
	 * dropped, weights are clamped to 100–900 and rounded to hundreds, styles other than `italic`
	 * become `normal`, and fonts left without files are removed. The default font is always kept.
	 *
	 * @param array<mixed, mixed>                                                               $fonts    Raw fonts.
	 * @param array{label: string, files: list<array{url: string, weight: int, style: string}>} $fallback Default entry, used when the filter removed it.
	 * @return array<string, array{label: string, files: list<array{url: string, weight: int, style: string}>}>
	 */
	public static function normalize( array $fonts, array $fallback ): array {
		$output = [];

		foreach ( $fonts as $slug => $font ) {
			$slug = preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $slug ) );
			if ( '' === $slug || ! is_array( $font ) || ! isset( $font['files'] ) || ! is_array( $font['files'] ) ) {
				continue;
			}

			$files = [];
			foreach ( $font['files'] as $file ) {
				$url = is_array( $file ) && isset( $file['url'] ) && is_string( $file['url'] ) ? trim( $file['url'] ) : '';
				if ( ! preg_match( '#^(https?:)?//[^\s]+$#i', $url ) ) {
					continue;
				}
				$weight  = isset( $file['weight'] ) && is_numeric( $file['weight'] ) ? (int) $file['weight'] : 400;
				$files[] = [
					'url'    => $url,
					'weight' => (int) ( round( max( 100, min( 900, $weight ) ) / 100 ) * 100 ),
					'style'  => isset( $file['style'] ) && 'italic' === $file['style'] ? 'italic' : 'normal',
				];
			}
			if ( ! $files ) {
				continue;
			}

			$label           = isset( $font['label'] ) && is_string( $font['label'] ) ? trim( $font['label'] ) : '';
			$output[ $slug ] = [
				'label' => '' !== $label ? $label : $slug,
				'files' => $files,
			];
		}

		if ( ! isset( $output[ self::DEFAULT ] ) ) {
			$output = [ self::DEFAULT => $fallback ] + $output;
		}

		return $output;
	}
}
