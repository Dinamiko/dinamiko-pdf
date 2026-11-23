<?php
/**
 * Static access to the plugin's PSR-11 container.
 *
 * @package Dinamiko\DinamikoPdf
 */

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf;

use LogicException;
use Psr\Container\ContainerInterface;

/**
 * Holds the container built when the plugin package boots.
 */
class Container {
	/**
	 * The plugin container, set on boot.
	 *
	 * @var ContainerInterface|null
	 */
	private static $container = null;

	/**
	 * Returns the plugin container.
	 *
	 * @return ContainerInterface
	 * @throws LogicException When called before the plugin has booted.
	 */
	public static function container(): ContainerInterface {
		if ( ! self::$container ) {
			throw new LogicException( 'No container, probably called too early when the plugin is not initialized yet.' );
		}

		return self::$container;
	}

	/**
	 * Alias of container().
	 *
	 * @return ContainerInterface
	 * @throws LogicException When called before the plugin has booted.
	 */
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
