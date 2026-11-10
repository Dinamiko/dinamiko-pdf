<?php
/**
 * Plugin Name: Content PDF
 * Description: WordPress PDF Generator
 * Version:     0.0.1
 * Author:      Dinamiko
 * License:     MIT
 * Text Domain: content-pdf
 * Requires at least: 6.5
 * Requires PHP: 8.1
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf;

use Inpsyde\Modularity\Package;
use Inpsyde\Modularity\Properties\PluginProperties;

defined( 'ABSPATH' ) || exit;

/**
 * Returns the plugin package, creating it on the first call.
 *
 * @return Package
 */
function plugin(): Package {
	static $package;

	if ( ! $package ) {
		$properties = PluginProperties::new( __FILE__ );
		$package    = Package::new( $properties )
			->addModule( new Settings\Module() )
			->addModule( new Export\Module() )
			->addModule( new Button\Module() );

		/**
		 * Extra modules (e.g. premium add-ons) to add to the package before it boots.
		 *
		 * @param \Inpsyde\Modularity\Module\Module[] $modules Modules.
		 */
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
