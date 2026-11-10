<?php
/**
 * Settings → Content PDF admin page.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Settings;

/**
 * Registers the options page, the setting and its fields.
 */
class SettingsPage {

	private const PAGE = 'content-pdf';

	/**
	 * Constructor.
	 *
	 * @param Settings $settings Settings.
	 */
	public function __construct( private Settings $settings ) {
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
			'post_types'  => __( 'Show button on', 'content-pdf' ),
			'paper'       => __( 'Paper size', 'content-pdf' ),
			'margin_mm'   => __( 'Page margins (mm)', 'content-pdf' ),
			'footer_text' => __( 'Footer text', 'content-pdf' ),
		];
		foreach ( $fields as $id => $label ) {
			add_settings_field( 'cpdf_' . $id, $label, [ $this, 'field_' . $id ], self::PAGE, 'cpdf_main' );
		}
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
	 * Footer field.
	 */
	public function field_footer_text(): void {
		printf(
			'<input type="text" name="%1$s[footer_text]" value="%2$s" class="regular-text"><p class="description">%3$s</p>',
			esc_attr( Settings::OPTION ),
			esc_attr( $this->settings->get()['footer_text'] ),
			esc_html__( 'Placeholders: ${currentPage}, ${totalPages}. Leave empty for no footer.', 'content-pdf' )
		);
	}
}
