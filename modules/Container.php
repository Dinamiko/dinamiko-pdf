<?php
/**
 * Plugin Name:       Content PDF
 * Description:       Lets visitors download any post, page or custom post type as a PDF, generated in the browser.
 * Version:           0.1.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Author:            dinamiko
 * License:           MIT
 * License URI:       https://opensource.org/license/mit
 * Text Domain:       content-pdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf;

use LogicException;
use Psr\Container\ContainerInterface;

class Container {
	private static $container = null;

	public static function container(): ContainerInterface {
		if ( ! self::$container ) {
			throw new LogicException( 'No container, probably called too early when the plugin is not initialized yet.' );
		}

		return self::$container;
	}

	public static function get_container(): ContainerInterface {
		return self::container();
	}

	/**
	 * Init the container.
	 *
	 * @param ContainerInterface $container The app container.
	 */
	public static function init( ContainerInterface $container ): void {
		self::$container = $container;
	}
}
