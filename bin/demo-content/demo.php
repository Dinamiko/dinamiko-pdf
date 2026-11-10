<?php
/**
 * Demo content for the local wp-env site: core blocks, patterns and templates.
 *
 * Run inside the wp-env `cli` container (see `npm run demo:seed` / `npm run demo:clean`):
 *
 *     wp eval-file bin/demo-content/demo.php seed   # clean, then create everything
 *     wp eval-file bin/demo-content/demo.php clean  # remove everything this script created
 *
 * Every object it creates is tagged with the `_cpdf_demo` meta, so `clean` never touches
 * other content. Options it changes are backed up and restored by `clean`.
 *
 * Block markup lives in `content/*.html`. Placeholders resolved at seed time:
 * `{{img:key:id}}`, `{{img:key:url}}`, `{{block:key}}`, `{{post:key:id}}`, `{{post:key:url}}`.
 *
 * @package Dinamiko\ContentPdf
 */

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	return;
}

/**
 * Creates and removes the demo content.
 */
final class Cpdf_Demo_Content {

	private const META       = '_cpdf_demo';
	private const BACKUP     = 'cpdf_demo_backup';
	private const THEME      = 'twentytwentyfive';
	private const CATEGORY   = 'Content PDF demo';
	private const TEMPLATE   = 'cpdf-demo-landing';
	private const FONT       = '/modules/Export/assets/fonts/NotoSans-Bold.ttf';
	private const POST_TYPES = [ 'post', 'page', 'attachment', 'wp_block', 'wp_template' ];

	/**
	 * Generated images: key => [ label, width, height, from colour, to colour ].
	 */
	private const IMAGES = [
		'hero'      => [ 'Mountain dawn', 1600, 900, '#1d2b64', '#f8cdda' ],
		'forest'    => [ 'Forest', 1600, 1067, '#134e5e', '#71b280' ],
		'ocean'     => [ 'Ocean', 1600, 1067, '#2b5876', '#4e4376' ],
		'desert'    => [ 'Desert', 1600, 1067, '#e65c00', '#f9d423' ],
		'portrait1' => [ 'Portrait A', 900, 1200, '#614385', '#516395' ],
		'portrait2' => [ 'Portrait B', 900, 1200, '#02aab0', '#00cdac' ],
		'square1'   => [ 'Square 1', 1000, 1000, '#ee0979', '#ff6a00' ],
		'square2'   => [ 'Square 2', 1000, 1000, '#7f00ff', '#e100ff' ],
		'square3'   => [ 'Square 3', 1000, 1000, '#00b09b', '#96c93d' ],
		'poster'    => [ 'Video poster', 1280, 720, '#232526', '#414345' ],
	];

	/**
	 * Synced patterns (wp_block): key => [ title, content file ].
	 */
	private const BLOCKS = [
		'contact'    => [ 'Company contact card', 'synced-contact.html' ],
		'disclaimer' => [ 'Legal disclaimer', 'synced-disclaimer.html' ],
	];

	/**
	 * Posts and pages, in creation order (later items can link to earlier ones).
	 * key => [ type, title, content file, extra ].
	 * Extra: `image` (featured image key), `template` (page template slug), `excerpt`.
	 */
	private const ITEMS = [
		'text'      => [ 'post', 'Core text blocks', 'post-text.html', [ 'image' => 'hero' ] ],
		'media'     => [ 'post', 'Media and layout blocks', 'post-media.html', [ 'image' => 'forest' ] ],
		'longform'  => [ 'post', 'A long-form article with page breaks', 'post-longform.html', [ 'image' => 'ocean' ] ],
		'embeds'    => [ 'post', 'Embeds, video and audio', 'post-embeds.html', [ 'image' => 'poster' ] ],
		'languages' => [ 'post', 'Typography and languages', 'post-languages.html', [] ],
		'patterns'  => [ 'page', 'Theme patterns', 'page-patterns.html', [] ],
		'synced'    => [ 'page', 'Synced patterns', 'page-synced.html', [] ],
		'business'  => [ 'page', 'Business home (full-page pattern, "Page No Title" template)', 'page-business.html', [ 'template' => 'page-no-title' ] ],
		'landing'   => [ 'page', 'Event landing (custom template)', 'page-landing.html', [ 'template' => self::TEMPLATE ] ],
		'shortcode' => [ 'page', 'Shortcode buttons', 'page-shortcode.html', [] ],
	];

	/**
	 * Created objects, for placeholder replacement.
	 *
	 * @var array{img: array<string, int>, block: array<string, int>, post: array<string, int>}
	 */
	private array $ids = [
		'img'   => [],
		'block' => [],
		'post'  => [],
	];

	/**
	 * Directory of this script.
	 *
	 * @var string
	 */
	private string $dir;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->dir = __DIR__;
	}

	/**
	 * Entry point.
	 *
	 * @param string $command `seed` or `clean`.
	 */
	public function run( string $command ): void {
		// Content is trusted (it is ours); keep iframes, inline styles, etc.
		kses_remove_filters();
		wp_set_current_user(
			(int) ( get_users(
				[
					'role'   => 'administrator',
					'number' => 1,
					'fields' => 'ID',
				]
			)[0] ?? 0 )
		);

		switch ( $command ) {
			case 'clean':
				$this->clean();
				break;
			case 'seed':
				$this->clean();
				$this->seed();
				break;
			default:
				WP_CLI::error( "Unknown command '{$command}'. Use 'seed' or 'clean'." );
		}
	}

	/**
	 * Remove every object tagged with the demo meta and restore the backed-up options.
	 */
	private function clean(): void {
		$ids = get_posts(
			[
				'post_type'        => self::POST_TYPES,
				'post_status'      => 'any',
				'numberposts'      => -1,
				'fields'           => 'ids',
				'meta_key'         => self::META, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'suppress_filters' => false,
			]
		);
		foreach ( $ids as $id ) {
			if ( 'attachment' === get_post_type( $id ) ) {
				wp_delete_attachment( $id, true );
			} else {
				wp_delete_post( $id, true );
			}
		}

		$terms = get_terms(
			[
				'taxonomy'   => 'category',
				'hide_empty' => false,
				'meta_key'   => self::META, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'fields'     => 'ids',
			]
		);
		foreach ( is_array( $terms ) ? $terms : [] as $term_id ) {
			wp_delete_term( (int) $term_id, 'category' );
		}

		$backup = get_option( self::BACKUP );
		if ( is_array( $backup ) ) {
			foreach ( $backup as $name => $value ) {
				if ( null === $value ) {
					delete_option( $name );
				} else {
					update_option( $name, $value );
				}
			}
			delete_option( self::BACKUP );
		}

		WP_CLI::success( sprintf( 'Removed %d demo objects.', count( $ids ) + count( is_array( $terms ) ? $terms : [] ) ) );
	}

	/**
	 * Create all demo content.
	 */
	private function seed(): void {
		if ( get_stylesheet() !== self::THEME ) {
			switch_theme( self::THEME );
			WP_CLI::log( 'Activated ' . self::THEME . '.' );
		}

		$this->backup_options( [ 'cpdf_settings', 'show_on_front', 'page_on_front' ] );

		foreach ( self::IMAGES as $key => $image ) {
			$this->ids['img'][ $key ] = $this->create_image( $key, ...$image );
		}
		WP_CLI::log( sprintf( 'Created %d images.', count( self::IMAGES ) ) );

		foreach ( self::BLOCKS as $key => [ $title, $file ] ) {
			$this->ids['block'][ $key ] = $this->insert(
				[
					'post_type'    => 'wp_block',
					'post_title'   => $title,
					'post_content' => $this->content( $file ),
				]
			);
		}

		$this->create_template();

		$category = wp_insert_term( self::CATEGORY, 'category' );
		if ( is_wp_error( $category ) ) {
			WP_CLI::error( $category );
		}
		add_term_meta( $category['term_id'], self::META, 1, true );

		foreach ( self::ITEMS as $key => [ $type, $title, $file, $extra ] ) {
			$id = $this->insert(
				[
					'post_type'     => $type,
					'post_title'    => $title,
					'post_content'  => $this->content( $file ),
					'post_category' => 'post' === $type ? [ $category['term_id'] ] : [],
				]
			);
			if ( isset( $extra['image'] ) ) {
				set_post_thumbnail( $id, $this->ids['img'][ $extra['image'] ] );
			}
			if ( isset( $extra['template'] ) ) {
				update_post_meta( $id, '_wp_page_template', $extra['template'] );
			}
			$this->ids['post'][ $key ] = $id;
		}

		$index = $this->insert(
			[
				'post_type'    => 'page',
				'post_title'   => 'Content PDF demo',
				'post_content' => $this->index_content(),
			]
		);

		$settings               = get_option( 'cpdf_settings', [] );
		$settings               = is_array( $settings ) ? $settings : [];
		$settings['post_types'] = [ 'post', 'page' ];
		update_option( 'cpdf_settings', $settings );
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $index );

		WP_CLI::success( sprintf( 'Demo content ready: %s', home_url( '/' ) ) );
	}

	/**
	 * Save the current values of options this script changes (only once, so re-seeding keeps the originals).
	 *
	 * @param string[] $names Option names.
	 */
	private function backup_options( array $names ): void {
		if ( false !== get_option( self::BACKUP ) ) {
			return;
		}
		$backup = [];
		foreach ( $names as $name ) {
			$value           = get_option( $name, null );
			$backup[ $name ] = false === $value ? null : $value;
		}
		update_option( self::BACKUP, $backup, false );
	}

	/**
	 * Insert a published post and tag it.
	 *
	 * @param array<string, mixed> $args wp_insert_post() arguments.
	 * @return int Post ID.
	 */
	private function insert( array $args ): int {
		$id = wp_insert_post( wp_slash( $args + [ 'post_status' => 'publish' ] ), true );
		if ( is_wp_error( $id ) ) {
			WP_CLI::error( $id );
		}
		update_post_meta( $id, self::META, 1 );
		return $id;
	}

	/**
	 * Create a custom block template for the theme: post content only, no header or footer.
	 */
	private function create_template(): void {
		$id = $this->insert(
			[
				'post_type'    => 'wp_template',
				'post_name'    => self::TEMPLATE,
				'post_title'   => 'Landing (no header or footer)',
				'post_excerpt' => 'Content PDF demo: a custom template that shows only the page content.',
				'post_content' => $this->content( 'template-landing.html' ),
			]
		);
		wp_set_object_terms( $id, self::THEME, 'wp_theme' );
	}

	/**
	 * Read a content file and resolve its placeholders.
	 *
	 * @param string $file File name in content/.
	 * @return string Block markup.
	 */
	private function content( string $file ): string {
		$path = $this->dir . '/content/' . $file;
		if ( ! is_readable( $path ) ) {
			WP_CLI::error( "Missing content file {$path}." );
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local file.
		$markup = (string) file_get_contents( $path );

		return (string) preg_replace_callback(
			'/\{\{(img|block|post):([a-z0-9_-]+)(?::(id|url))?\}\}/',
			function ( array $m ): string {
				[ , $kind, $key ] = $m;
				$field            = $m[3] ?? 'id';
				if ( ! isset( $this->ids[ $kind ][ $key ] ) ) {
					WP_CLI::error( "Unresolved placeholder {$m[0]}." );
				}
				$id = $this->ids[ $kind ][ $key ];
				if ( 'id' === $field ) {
					return (string) $id;
				}
				return 'img' === $kind ? (string) wp_get_attachment_url( $id ) : (string) get_permalink( $id );
			},
			$markup
		);
	}

	/**
	 * Front page: what the demo covers, with links to each item and its export URLs.
	 *
	 * @return string Block markup.
	 */
	private function index_content(): string {
		$items = '';
		foreach ( self::ITEMS as $key => [ $type, $title ] ) {
			$id    = $this->ids['post'][ $key ];
			$url   = get_permalink( $id );
			$pdf   = add_query_arg( 'cpdf_print', '1', $url );
			$print = add_query_arg( 'cpdf_mode', 'print', $pdf );

			$items .= sprintf(
				"<!-- wp:list-item -->\n<li><a href=\"%s\">%s</a> (%s): <a href=\"%s\">download PDF</a> · <a href=\"%s\">print dialog</a></li>\n<!-- /wp:list-item -->\n\n",
				esc_url( $url ),
				esc_html( $title ),
				esc_html( $type ),
				esc_url( $pdf ),
				esc_url( $print )
			);
		}

		return str_replace( '{{items}}', rtrim( $items ), $this->content( 'page-index.html' ) );
	}

	/**
	 * Generate a gradient JPEG with a label and add it to the media library.
	 *
	 * @param string $key    Image key (file name).
	 * @param string $label  Text drawn on the image.
	 * @param int    $width  Width in px.
	 * @param int    $height Height in px.
	 * @param string $from   Top-left colour (hex).
	 * @param string $to     Bottom-right colour (hex).
	 * @return int Attachment ID.
	 */
	private function create_image( string $key, string $label, int $width, int $height, string $from, string $to ): int {
		$img = imagecreatetruecolor( $width, $height );
		$a   = sscanf( $from, '#%02x%02x%02x' );
		$b   = sscanf( $to, '#%02x%02x%02x' );

		// Diagonal gradient, drawn as vertical lines with a horizontal + vertical blend.
		$steps = $width + $height;
		for ( $x = 0; $x < $width; $x++ ) {
			for ( $y = 0; $y < $height; $y += 4 ) {
				$t = ( $x + $y ) / $steps;
				$c = imagecolorallocate(
					$img,
					(int) ( $a[0] + ( $b[0] - $a[0] ) * $t ),
					(int) ( $a[1] + ( $b[1] - $a[1] ) * $t ),
					(int) ( $a[2] + ( $b[2] - $a[2] ) * $t )
				);
				imageline( $img, $x, $y, $x, min( $y + 3, $height - 1 ), $c );
			}
		}

		$font  = dirname( $this->dir, 2 ) . self::FONT;
		$size  = (int) ( $width / 16 );
		$white = imagecolorallocatealpha( $img, 255, 255, 255, 20 );
		$box   = imagettfbbox( $size, 0, $font, $label );
		imagettftext(
			$img,
			$size,
			0,
			(int) ( ( $width - ( $box[2] - $box[0] ) ) / 2 ),
			(int) ( ( $height + ( $box[1] - $box[7] ) ) / 2 ),
			$white,
			$font,
			$label
		);

		ob_start();
		imagejpeg( $img, null, 85 );
		$data = (string) ob_get_clean();
		imagedestroy( $img );

		$upload = wp_upload_bits( "cpdf-demo-{$key}.jpg", null, $data );
		if ( ! empty( $upload['error'] ) ) {
			WP_CLI::error( $upload['error'] );
		}

		$id = wp_insert_attachment(
			[
				'post_title'     => $label,
				'post_mime_type' => 'image/jpeg',
				'post_status'    => 'inherit',
			],
			$upload['file'],
			0,
			true
		);
		if ( is_wp_error( $id ) ) {
			WP_CLI::error( $id );
		}
		update_post_meta( $id, '_wp_attachment_image_alt', $label );
		update_post_meta( $id, self::META, 1 );

		require_once ABSPATH . 'wp-admin/includes/image.php';
		wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $upload['file'] ) );

		return $id;
	}
}

( new Cpdf_Demo_Content() )->run( (string) ( $args[0] ?? 'seed' ) );
