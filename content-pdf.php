<?php
/**
 * Plugin Name: Content PDF
 * Description: WordPress PDF Generator
 * Version:     0.0.1
 * Author:      Dinamiko
 * License:     MIT
 * Text Domain: content-pdf
 * Requires PHP: 8.1
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf;

use Dinamiko\ContentPdf\Sample\Module;
use Inpsyde\Modularity\Package;
use Inpsyde\Modularity\Properties\PluginProperties;

/**
 * Returns the plugin package, creating it on the first call.
 *
 * @return Package
 */
function plugin(): Package {
	static $package;

	if ( ! $package ) {
		$properties = PluginProperties::new( __FILE__ );
		$package    = Package::new( $properties )->addModule( new Module() );

		$modules = apply_filters( 'cpdf_modules', [] );
		foreach ( $modules as $module ) {
			$package->addModule( $module );
		}
	}

	/** @var Package $package */
	return $package;
}

add_action(
	'plugins_loaded',
	static function (): void {
		if ( is_readable( __DIR__ . '/vendor/autoload.php' ) ) {
			include_once __DIR__ . '/vendor/autoload.php';
		}

		plugin()->boot();

		Container::init( plugin()->container() );
	}
);
