<?php
/**
 * Button module.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Button;

use Dinamiko\ContentPdf\Export\PrintEndpoint;
use Dinamiko\ContentPdf\Settings\Settings;
use Inpsyde\Modularity\Module\ExecutableModule;
use Inpsyde\Modularity\Module\ModuleClassNameIdTrait;
use Inpsyde\Modularity\Module\ServiceModule;
use Inpsyde\Modularity\Package;
use Psr\Container\ContainerInterface;

/**
 * Provides the "Download PDF" button (automatic placement and shortcode).
 */
class Module implements ServiceModule, ExecutableModule {
	use ModuleClassNameIdTrait;

	/**
	 * Service factories.
	 *
	 * @return array<string, callable>
	 */
	public function services(): array {
		return [
			Button::class => static fn( ContainerInterface $container ): Button => new Button(
				$container->get( Settings::class ),
				$container->get( PrintEndpoint::class ),
				$container->get( Package::PROPERTIES )
			),
		];
	}

	/**
	 * Register hooks.
	 *
	 * @param ContainerInterface $container Container.
	 * @return bool
	 */
	public function run( ContainerInterface $container ): bool {
		add_action(
			'wp_enqueue_scripts',
			static function () use ( $container ): void {
				$container->get( Button::class )->register_assets();
			}
		);

		add_filter(
			'the_content',
			static function ( $content ) use ( $container ) {
				return is_string( $content ) ? $container->get( Button::class )->append( $content ) : $content;
			},
			20
		);

		add_shortcode(
			Button::SHORTCODE,
			static function ( $atts ) use ( $container ): string {
				return $container->get( Button::class )->shortcode( is_array( $atts ) ? $atts : (string) $atts );
			}
		);

		return true;
	}
}
