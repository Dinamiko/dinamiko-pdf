<?php
/**
 * E2E fixture: registers an extra PDF font through the `dinamiko_pdf_fonts` filter.
 *
 * It reuses the bundled Noto Sans Bold file as the regular face, so the test needs no extra font.
 *
 * @package DinamikoPdfTestChild
 */

add_filter(
	'dinamiko_pdf_fonts',
	static function ( array $fonts ): array {
		$fonts['dinamiko-pdf-test-font'] = [
			'label' => 'Test Font',
			'files' => [
				[
					'url'    => plugins_url( 'modules/Export/assets/fonts/NotoSans-Bold.ttf', WP_PLUGIN_DIR . '/dinamiko-pdf/dinamiko-pdf.php' ),
					'weight' => 400,
				],
			],
		];
		return $fonts;
	}
);
