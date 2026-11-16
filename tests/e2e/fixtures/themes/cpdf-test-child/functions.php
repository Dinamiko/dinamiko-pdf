<?php
/**
 * E2E fixture: registers an extra PDF font through the `cpdf_fonts` filter.
 *
 * It reuses the bundled Noto Sans Bold file as the regular face, so the test needs no extra font.
 *
 * @package CpdfTestChild
 */

add_filter(
	'cpdf_fonts',
	static function ( array $fonts ): array {
		$fonts['cpdf-test-font'] = [
			'label' => 'Test Font',
			'files' => [
				[
					'url'    => plugins_url( 'modules/Export/assets/fonts/NotoSans-Bold.ttf', WP_PLUGIN_DIR . '/content-pdf/content-pdf.php' ),
					'weight' => 400,
				],
			],
		];
		return $fonts;
	}
);
