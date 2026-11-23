<?php
/**
 * Demo content for the local wp-env site: core blocks, patterns and templates.
 *
 * Run inside the wp-env `cli` container (see `npm run demo:seed` / `npm run demo:clean`):
 *
 *     wp eval-file bin/demo-content/demo.php seed          # block theme demo (Twenty Twenty-Five)
 *     wp eval-file bin/demo-content/demo.php seed classic  # classic theme demo (Twenty Twenty-One)
 *     wp eval-file bin/demo-content/demo.php clean         # remove everything this script created
 *
 * `seed` cleans first, then activates the theme and creates the content. The classic demo
 * leaves out everything that needs a block theme: theme and full-page patterns, synced
 * patterns and the custom template.
 *
 * Every object it creates is tagged with the `_dinamiko_pdf_demo` meta, so `clean` never touches
 * other content. Options it changes are backed up and restored by `clean`.
 *
 * Block markup lives in `content/*.html`. Placeholders resolved at seed time:
 * `{{img:key:id}}`, `{{img:key:url}}`, `{{media:key:url}}`, `{{block:key}}`, `{{post:key:id}}`, `{{post:key:url}}`.
 * Post URLs are `?p=ID` / `?page_id=ID` links (see link()), so they keep working when the
 * permalink structure changes after seeding.
 *
 * @package Dinamiko\DinamikoPdf
 */

defined( 'ABSPATH' ) || exit;

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	return;
}

/**
 * Creates and removes the demo content.
 */
final class Dinamiko_Pdf_Demo_Content {

	private const META       = '_dinamiko_pdf_demo';
	private const BACKUP     = 'dinamiko_pdf_demo_backup';
	private const THEMES     = [
		'block'   => 'twentytwentyfive',
		'classic' => 'twentytwentyone',
	];
	private const CATEGORY   = 'Dinamiko PDF demo';
	private const TEMPLATE   = 'dinamiko-pdf-demo-landing';
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
	 * Extra: `image` (featured image key), `template` (page template slug), `excerpt`,
	 * `block_only` (block editor or Twenty Twenty-Five features: left out of the classic demo).
	 */
	private const ITEMS = [
		'text'      => [ 'post', 'Core text blocks', 'post-text.html', [ 'image' => 'hero' ] ],
		'media'     => [ 'post', 'Media and layout blocks', 'post-media.html', [ 'image' => 'forest' ] ],
		'longform'  => [ 'post', 'A long-form article with page breaks', 'post-longform.html', [ 'image' => 'ocean' ] ],
		'embeds'    => [ 'post', 'Embeds, video and audio', 'post-embeds.html', [ 'image' => 'poster' ] ],
		'languages' => [ 'post', 'Typography and languages', 'post-languages.html', [] ],
		'classic'   => [ 'post', 'Classic editor content (no blocks)', 'post-classic.html', [ 'image' => 'desert' ] ],
		'patterns'  => [ 'page', 'Theme patterns', 'page-patterns.html', [ 'block_only' => true ] ],
		'synced'    => [ 'page', 'Synced patterns', 'page-synced.html', [ 'block_only' => true ] ],
		'business'  => [
			'page',
			'Business home (full-page pattern, "Page No Title" template)',
			'page-business.html',
			[
				'template'   => 'page-no-title',
				'block_only' => true,
			],
		],
		'landing'   => [
			'page',
			'Event landing (custom template)',
			'page-landing.html',
			[
				'template'   => self::TEMPLATE,
				'block_only' => true,
			],
		],
		'shortcode' => [ 'page', 'Shortcode buttons', 'page-shortcode.html', [] ],
	];

	/**
	 * Created objects, for placeholder replacement.
	 *
	 * @var array{img: array<string, int>, media: array<string, int>, block: array<string, int>, post: array<string, int>}
	 */
	private array $ids = [
		'img'   => [],
		'media' => [],
		'block' => [],
		'post'  => [],
	];

	/**
	 * Demo flavour: `block` or `classic`.
	 *
	 * @var string
	 */
	private string $mode = 'block';

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
	 * @param string $mode    `block` (default) or `classic`, for `seed`.
	 */
	public function run( string $command, string $mode = 'block' ): void {
		if ( ! isset( self::THEMES[ $mode ] ) ) {
			WP_CLI::error( "Unknown demo '{$mode}'. Use 'block' or 'classic'." );
		}
		$this->mode = $mode;

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
		$theme = self::THEMES[ $this->mode ];
		if ( get_stylesheet() !== $theme ) {
			if ( ! wp_get_theme( $theme )->exists() ) {
				WP_CLI::error( "Theme '{$theme}' is not installed." );
			}
			switch_theme( $theme );
			WP_CLI::log( "Activated {$theme}." );
		}
		$classic = 'classic' === $this->mode;

		$this->backup_options( [ 'dinamiko_pdf_settings', 'show_on_front', 'page_on_front' ] );

		foreach ( self::IMAGES as $key => $image ) {
			$this->ids['img'][ $key ] = $this->create_image( $key, ...$image );
		}
		WP_CLI::log( sprintf( 'Created %d images.', count( self::IMAGES ) ) );

		// Local audio for the media blocks, so the demo loads nothing from third-party services.
		$this->ids['media']['tone'] = $this->create_audio( 'tone', 'Demo tone', 3 );

		foreach ( $classic ? [] : self::BLOCKS as $key => [ $title, $file ] ) {
			$this->ids['block'][ $key ] = $this->insert(
				[
					'post_type'    => 'wp_block',
					'post_title'   => $title,
					'post_content' => $this->content( $file ),
				]
			);
		}

		if ( ! $classic ) {
			$this->create_template();
		}

		$category = wp_insert_term( self::CATEGORY, 'category' );
		if ( is_wp_error( $category ) ) {
			WP_CLI::error( $category );
		}
		add_term_meta( $category['term_id'], self::META, 1, true );

		foreach ( self::ITEMS as $key => [ $type, $title, $file, $extra ] ) {
			if ( $classic && ! empty( $extra['block_only'] ) ) {
				continue;
			}
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
				'post_title'   => 'Dinamiko PDF demo',
				'post_content' => $this->index_content(),
			]
		);

		$settings               = get_option( 'dinamiko_pdf_settings', [] );
		$settings               = is_array( $settings ) ? $settings : [];
		$settings['post_types'] = [ 'post', 'page' ];
		update_option( 'dinamiko_pdf_settings', $settings );
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $index );

		WP_CLI::success( sprintf( 'Demo content (%s theme) ready: %s', $this->mode, home_url( '/' ) ) );
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
				'post_excerpt' => 'Dinamiko PDF demo: a custom template that shows only the page content.',
				'post_content' => $this->content( 'template-landing.html' ),
			]
		);
		wp_set_object_terms( $id, self::THEMES['block'], 'wp_theme' );
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

		// The classic demo has no synced patterns: drop the references to them.
		if ( 'classic' === $this->mode ) {
			$markup = (string) preg_replace( '/^<!-- wp:block \{"ref":\{\{block:[a-z0-9_-]+\}\}\} \/-->\n*/m', '', $markup );
		}

		return (string) preg_replace_callback(
			'/\{\{(img|media|block|post):([a-z0-9_-]+)(?::(id|url))?\}\}/',
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
				return in_array( $kind, [ 'img', 'media' ], true ) ? (string) wp_get_attachment_url( $id ) : $this->link( $id );
			},
			$markup
		);
	}

	/**
	 * Permalink-independent URL of a post or page.
	 *
	 * The seeded markup stores URLs, so they must not depend on the permalink structure at seed
	 * time. WordPress resolves `?p=` / `?page_id=` with any structure, and redirect_canonical()
	 * forwards them (keeping extra query args such as `dinamiko_pdf_print`) to the current pretty URL.
	 *
	 * @param int $id Post ID.
	 * @return string URL.
	 */
	private function link( int $id ): string {
		return add_query_arg( 'page' === get_post_type( $id ) ? 'page_id' : 'p', $id, home_url( '/' ) );
	}

	/**
	 * Front page: what the demo covers, with links to each item and its export URLs, grouped by
	 * the themes each item works with.
	 *
	 * @return string Block markup.
	 */
	private function index_content(): string {
		$lists = [
			'items_any'   => '',
			'items_block' => '',
		];
		foreach ( self::ITEMS as $key => [ $type, $title, , $extra ] ) {
			if ( ! isset( $this->ids['post'][ $key ] ) ) {
				continue;
			}
			$id    = $this->ids['post'][ $key ];
			$url   = $this->link( $id );
			$pdf   = add_query_arg( 'dinamiko_pdf_print', '1', $url );
			$print = add_query_arg( 'dinamiko_pdf_mode', 'print', $pdf );
			$list  = empty( $extra['block_only'] ) ? 'items_any' : 'items_block';

			$li = '<li><a href="%s">%s</a> (%s): <a href="%s">download PDF</a> · <a href="%s">print dialog</a></li>';

			$lists[ $list ] .= sprintf(
				// The classic index is plain HTML; the block index uses list-item blocks.
				'classic' === $this->mode ? "\t{$li}\n" : "<!-- wp:list-item -->\n{$li}\n<!-- /wp:list-item -->\n\n",
				esc_url( $url ),
				esc_html( $title ),
				esc_html( $type ),
				esc_url( $pdf ),
				esc_url( $print )
			);
		}

		$markup = $this->content( 'classic' === $this->mode ? 'page-index-classic.html' : 'page-index.html' );
		foreach ( $lists as $placeholder => $items ) {
			$markup = str_replace( '{{' . $placeholder . '}}', rtrim( $items ), $markup );
		}
		return $markup;
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

		$id = $this->attach( "dinamiko-pdf-demo-{$key}.jpg", $data, $label, 'image/jpeg' );
		update_post_meta( $id, '_wp_attachment_image_alt', $label );

		return $id;
	}

	/**
	 * Generate a short WAV tone (16-bit mono PCM) and add it to the media library.
	 *
	 * @param string $key     Audio key (file name).
	 * @param string $label   Attachment title.
	 * @param int    $seconds Duration in seconds.
	 * @return int Attachment ID.
	 */
	private function create_audio( string $key, string $label, int $seconds ): int {
		$rate    = 8000;
		$samples = $rate * $seconds;
		$pcm     = '';
		for ( $i = 0; $i < $samples; $i++ ) {
			// A 440 Hz tone at a third of full volume, faded out over the duration.
			$fade = 1 - $i / $samples;
			$pcm .= pack( 'v', (int) ( sin( 2 * M_PI * 440 * $i / $rate ) * 10000 * $fade ) & 0xFFFF );
		}
		$size = strlen( $pcm );
		$data = 'RIFF' . pack( 'V', 36 + $size ) . 'WAVE'
			. 'fmt ' . pack( 'VvvVVvv', 16, 1, 1, $rate, $rate * 2, 2, 16 )
			. 'data' . pack( 'V', $size ) . $pcm;

		return $this->attach( "dinamiko-pdf-demo-{$key}.wav", $data, $label, 'audio/wav' );
	}

	/**
	 * Upload a generated file and add it to the media library, tagged as demo content.
	 *
	 * @param string $name  File name.
	 * @param string $data  File contents.
	 * @param string $title Attachment title.
	 * @param string $mime  MIME type.
	 * @return int Attachment ID.
	 */
	private function attach( string $name, string $data, string $title, string $mime ): int {
		$upload = wp_upload_bits( $name, null, $data );
		if ( ! empty( $upload['error'] ) ) {
			WP_CLI::error( $upload['error'] );
		}

		$id = wp_insert_attachment(
			[
				'post_title'     => $title,
				'post_mime_type' => $mime,
				'post_status'    => 'inherit',
			],
			$upload['file'],
			0,
			true
		);
		if ( is_wp_error( $id ) ) {
			WP_CLI::error( $id );
		}
		update_post_meta( $id, self::META, 1 );

		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $upload['file'] ) );

		return $id;
	}
}

( new Dinamiko_Pdf_Demo_Content() )->run( (string) ( $args[0] ?? 'seed' ), (string) ( $args[1] ?? 'block' ) );
