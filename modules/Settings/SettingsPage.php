<?php
/**
 * Settings → Content PDF admin page.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Settings;

use Inpsyde\Modularity\Properties\Properties;

/**
 * Registers the options page, the setting and its fields.
 */
class SettingsPage {

	private const PAGE      = 'content-pdf';
	private const HOOK      = 'settings_page_content-pdf';
	private const HANDLE    = 'cpdf-settings';
	private const BUILD_DIR = 'modules/Settings/build/';

	/**
	 * Constructor.
	 *
	 * @param Settings   $settings   Settings.
	 * @param Properties $properties Plugin properties.
	 */
	public function __construct(
		private Settings $settings,
		private Properties $properties
	) {
	}

	/**
	 * Add the options page.
	 */
	public function add_page(): void {
		add_options_page(
			__( 'Content PDF', 'content-pdf' ),
			__( 'Content PDF', 'content-pdf' ),
			'manage_options',
			self::PAGE,
			[ $this, 'render_page' ]
		);
	}

	/**
	 * Register setting, section and fields.
	 */
	public function register(): void {
		register_setting(
			self::PAGE,
			Settings::OPTION,
			[
				'type'              => 'array',
				'sanitize_callback' => [ $this->settings, 'sanitize' ],
				'default'           => Settings::defaults(),
			]
		);

		add_settings_section( 'cpdf_main', '', '__return_false', self::PAGE );

		$fields = [
			'post_types' => __( 'Show button on', 'content-pdf' ),
			'paper'      => __( 'Paper size', 'content-pdf' ),
			'margin_mm'  => __( 'Page margins (mm)', 'content-pdf' ),
		];
		foreach ( $fields as $id => $label ) {
			add_settings_field( 'cpdf_' . $id, $label, [ $this, 'field_' . $id ], self::PAGE, 'cpdf_main' );
		}

		add_settings_section(
			'cpdf_regions',
			__( 'Header & footer', 'content-pdf' ),
			[ $this, 'section_regions' ],
			self::PAGE
		);

		$fields = [
			'header_logo'        => __( 'Header logo', 'content-pdf' ),
			'header'             => __( 'Header text', 'content-pdf' ),
			'footer'             => __( 'Footer text', 'content-pdf' ),
			'header_spacing_mm'  => __( 'Header spacing (mm)', 'content-pdf' ),
			'hf_style'           => __( 'Text style', 'content-pdf' ),
			'hf_skip_first_page' => __( 'First page', 'content-pdf' ),
		];
		foreach ( $fields as $id => $label ) {
			add_settings_field( 'cpdf_' . $id, $label, [ $this, 'field_' . $id ], self::PAGE, 'cpdf_regions' );
		}
	}

	/**
	 * Enqueue the media picker and color picker on the settings page.
	 *
	 * @param string $hook_suffix Current admin page.
	 */
	public function enqueue_assets( string $hook_suffix ): void {
		if ( self::HOOK !== $hook_suffix ) {
			return;
		}
		$asset_file = $this->properties->basePath() . self::BUILD_DIR . 'index.asset.php';
		if ( ! is_readable( $asset_file ) ) {
			return;
		}
		$asset = require $asset_file;

		wp_enqueue_media();
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_script(
			self::HANDLE,
			$this->properties->baseUrl() . self::BUILD_DIR . 'index.js',
			array_merge( $asset['dependencies'], [ 'jquery', 'wp-color-picker' ] ),
			$asset['version'],
			[ 'in_footer' => true ]
		);
		wp_add_inline_script(
			self::HANDLE,
			'window.cpdfSettings = ' . wp_json_encode(
				[
					'frameTitle'  => __( 'Select header logo', 'content-pdf' ),
					'frameButton' => __( 'Use as logo', 'content-pdf' ),
				]
			) . ';',
			'before'
		);
	}

	/**
	 * Render the page.
	 */
	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<form action="options.php" method="post">
				<?php
				settings_fields( self::PAGE );
				do_settings_sections( self::PAGE );
				submit_button();
				?>
			</form>
			<p>
				<?php
				printf(
					/* translators: %s: shortcode */
					esc_html__( 'Use the %s shortcode to place the button anywhere, on any post type.', 'content-pdf' ),
					'<code>[content_pdf_button]</code>'
				);
				?>
			</p>
		</div>
		<?php
	}

	/**
	 * Post types field.
	 */
	public function field_post_types(): void {
		$selected = $this->settings->get()['post_types'];
		foreach ( get_post_types( [ 'public' => true ], 'objects' ) as $type ) {
			if ( 'attachment' === $type->name ) {
				continue;
			}
			printf(
				'<label style="display:block"><input type="checkbox" name="%1$s[post_types][]" value="%2$s" %3$s> %4$s</label>',
				esc_attr( Settings::OPTION ),
				esc_attr( $type->name ),
				checked( in_array( $type->name, $selected, true ), true, false ),
				esc_html( $type->labels->name )
			);
		}
	}

	/**
	 * Paper field.
	 */
	public function field_paper(): void {
		$current = $this->settings->get()['paper'];
		$labels  = [
			'a4'     => 'A4',
			'letter' => 'US Letter',
		];
		printf( '<select name="%s[paper]">', esc_attr( Settings::OPTION ) );
		foreach ( $labels as $value => $label ) {
			printf( '<option value="%1$s" %2$s>%3$s</option>', esc_attr( $value ), selected( $current, $value, false ), esc_html( $label ) );
		}
		echo '</select>';
	}

	/**
	 * Margin field.
	 */
	public function field_margin_mm(): void {
		printf(
			'<input type="number" min="0" max="50" step="1" name="%1$s[margin_mm]" value="%2$s" class="small-text">',
			esc_attr( Settings::OPTION ),
			esc_attr( (string) $this->settings->get()['margin_mm'] )
		);
	}

	/**
	 * Header & footer section description.
	 */
	public function section_regions(): void {
		printf(
			'<p>%1$s</p><p>%2$s <code>{title}</code> <code>{site}</code> <code>{date}</code> <code>{url}</code> <code>${currentPage}</code> <code>${totalPages}</code></p>',
			esc_html__( 'Shown on every PDF page, inside the top and bottom margins. Leave every slot of a region empty (and no logo, for the header) to turn it off. Themes can override the markup with content-pdf/header.php and content-pdf/footer.php.', 'content-pdf' ),
			esc_html__( 'Placeholders:', 'content-pdf' )
		);
	}

	/**
	 * Header logo field: media picker and height.
	 */
	public function field_header_logo(): void {
		$settings = $this->settings->get();
		$logo_id  = (int) $settings['header_logo_id'];
		$preview  = $logo_id ? wp_get_attachment_image( $logo_id, 'medium', false, [ 'style' => 'max-height:60px;width:auto;display:block' ] ) : '';
		?>
		<div class="cpdf-logo-field">
			<div class="cpdf-logo-preview" style="margin-bottom:8px"><?php echo wp_kses_post( $preview ); ?></div>
			<input type="hidden" class="cpdf-logo-id" name="<?php echo esc_attr( Settings::OPTION ); ?>[header_logo_id]" value="<?php echo esc_attr( (string) $logo_id ); ?>">
			<button type="button" class="button cpdf-logo-select"><?php esc_html_e( 'Select image', 'content-pdf' ); ?></button>
			<button type="button" class="button-link button-link-delete cpdf-logo-remove" <?php echo $logo_id ? '' : 'hidden'; ?>><?php esc_html_e( 'Remove', 'content-pdf' ); ?></button>
		</div>
		<p>
			<label>
				<?php esc_html_e( 'Height (px)', 'content-pdf' ); ?>
				<input type="number" min="<?php echo (int) Settings::LOGO_HEIGHT_MIN; ?>" max="<?php echo (int) Settings::LOGO_HEIGHT_MAX; ?>" step="1" name="<?php echo esc_attr( Settings::OPTION ); ?>[header_logo_height]" value="<?php echo esc_attr( (string) $settings['header_logo_height'] ); ?>" class="small-text">
			</label>
		</p>
		<p class="description"><?php esc_html_e( 'PNG or JPEG. Drawn at the left of the header; it is scaled down if it does not fit in the top margin.', 'content-pdf' ); ?></p>
		<?php
	}

	/**
	 * Header text slots.
	 */
	public function field_header(): void {
		$this->render_slots( 'header' );
	}

	/**
	 * Footer text slots.
	 */
	public function field_footer(): void {
		$this->render_slots( 'footer' );
	}

	/**
	 * Extra header height.
	 */
	public function field_header_spacing_mm(): void {
		printf(
			'<input type="number" min="0" max="%1$d" step="1" name="%2$s[header_spacing_mm]" value="%3$s" class="small-text"><p class="description">%4$s</p>',
			(int) Settings::HEADER_SPACING_MAX,
			esc_attr( Settings::OPTION ),
			esc_attr( (string) $this->settings->get()['header_spacing_mm'] ),
			esc_html__( 'Extra height added to the header, on top of the page margin. The logo and text stay vertically centered; the content starts lower by the same amount.', 'content-pdf' )
		);
	}

	/**
	 * Font size and color.
	 */
	public function field_hf_style(): void {
		$settings = $this->settings->get();
		printf(
			'<label>%1$s <input type="number" min="%2$d" max="%3$d" step="1" name="%4$s[header_font_size]" value="%5$s" class="small-text"></label> &nbsp; <label>%8$s <input type="number" min="%2$d" max="%3$d" step="1" name="%4$s[footer_font_size]" value="%9$s" class="small-text"></label> &nbsp; <input type="text" name="%4$s[hf_color]" value="%6$s" class="cpdf-color" data-default-color="%7$s">',
			esc_html__( 'Header font size (px)', 'content-pdf' ),
			(int) Settings::FONT_SIZE_MIN,
			(int) Settings::FONT_SIZE_MAX,
			esc_attr( Settings::OPTION ),
			esc_attr( (string) $settings['header_font_size'] ),
			esc_attr( (string) $settings['hf_color'] ),
			esc_attr( (string) Settings::defaults()['hf_color'] ),
			esc_html__( 'Footer font size (px)', 'content-pdf' ),
			esc_attr( (string) $settings['footer_font_size'] )
		);
	}

	/**
	 * Hide header and footer on the first page.
	 */
	public function field_hf_skip_first_page(): void {
		printf(
			'<label><input type="checkbox" name="%1$s[hf_skip_first_page]" value="1" %2$s> %3$s</label>',
			esc_attr( Settings::OPTION ),
			checked( (bool) $this->settings->get()['hf_skip_first_page'], true, false ),
			esc_html__( 'Hide the header and footer on the first page', 'content-pdf' )
		);
	}

	/**
	 * Left / center / right inputs of a region.
	 *
	 * @param string $region `header` or `footer`.
	 */
	private function render_slots( string $region ): void {
		$settings = $this->settings->get();
		$labels   = [
			__( 'Left', 'content-pdf' ),
			__( 'Center', 'content-pdf' ),
			__( 'Right', 'content-pdf' ),
		];
		echo '<div style="display:flex;flex-wrap:wrap;gap:8px">';
		foreach ( Settings::REGION_SLOTS[ $region ] as $i => $key ) {
			printf(
				'<label style="display:flex;flex-direction:column"><span>%1$s</span><input type="text" name="%2$s[%3$s]" value="%4$s"></label>',
				esc_html( $labels[ $i ] ),
				esc_attr( Settings::OPTION ),
				esc_attr( $key ),
				esc_attr( (string) $settings[ $key ] )
			);
		}
		echo '</div>';
	}
}
