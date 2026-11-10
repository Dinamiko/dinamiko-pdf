<?php
/**
 * Browser engine: dompdf.js running in the visitor's browser.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Export\Engine;

use Inpsyde\Modularity\Properties\Properties;

/**
 * Enqueues the bundled dompdf.js build and the export script on the print page.
 */
class BrowserEngine implements Engine {

	private const VENDOR_DIR = 'modules/Export/assets/vendor/dompdf/';
	private const BUILD_DIR  = 'modules/Export/build/';

	/**
	 * Constructor.
	 *
	 * @param Properties $properties Plugin properties.
	 */
	public function __construct( private Properties $properties ) {
	}

	/**
	 * {@inheritDoc}
	 */
	public function id(): string {
		return 'browser';
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param array<string, mixed> $config Export config.
	 */
	public function enqueue_print_assets( array $config ): void {
		$base_path = $this->properties->basePath();
		$base_url  = (string) $this->properties->baseUrl();

		// Missing vendor file → only the export script loads and falls back to window.print().
		$deps = [];
		if ( is_readable( $base_path . self::VENDOR_DIR . 'dompdf.min.js' ) ) {
			$version = trim( (string) file_get_contents( $base_path . self::VENDOR_DIR . 'VERSION' ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local file.
			wp_enqueue_script(
				'cpdf-dompdf',
				$base_url . self::VENDOR_DIR . 'dompdf.min.js',
				[],
				'' !== $version ? $version : $this->properties->version(),
				true
			);
			$deps[] = 'cpdf-dompdf';
		}

		$asset_file = $base_path . self::BUILD_DIR . 'index.asset.php';
		$asset      = is_readable( $asset_file ) ? require $asset_file : [
			'dependencies' => [],
			'version'      => $this->properties->version(),
		];

		wp_enqueue_script(
			'cpdf-export',
			$base_url . self::BUILD_DIR . 'index.js',
			array_merge( $asset['dependencies'], $deps ),
			$asset['version'],
			true
		);
		wp_add_inline_script( 'cpdf-export', 'window.cpdfConfig = ' . wp_json_encode( $config ) . ';', 'before' );
	}
}
