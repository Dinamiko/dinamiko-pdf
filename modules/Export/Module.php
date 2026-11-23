<?php
/**
 * Export module.
 *
 * @package Dinamiko\DinamikoPdf
 */

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\Export;

use Dinamiko\DinamikoPdf\Export\Engine\BrowserEngine;
use Dinamiko\DinamikoPdf\Export\Engine\Engine;
use Dinamiko\DinamikoPdf\Settings\Fonts;
use Dinamiko\DinamikoPdf\Settings\Settings;
use Inpsyde\Modularity\Module\ExecutableModule;
use Inpsyde\Modularity\Module\ModuleClassNameIdTrait;
use Inpsyde\Modularity\Module\ServiceModule;
use Inpsyde\Modularity\Package;
use Psr\Container\ContainerInterface;

/**
 * Provides the print page (?dinamiko_pdf_print=1) and the PDF engine.
 *
 * Other modules use `$container->get( PrintEndpoint::class )->is_active()` to know whether
 * the current request renders the print page.
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
			Engine::class        => static fn( ContainerInterface $container ): Engine => new BrowserEngine(
				$container->get( Package::PROPERTIES )
			),
			PrintEndpoint::class => static fn( ContainerInterface $container ): PrintEndpoint => new PrintEndpoint(
				$container->get( Settings::class ),
				$container->get( Fonts::class ),
				$container->get( Engine::class ),
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
			'template_redirect',
			static function () use ( $container ): void {
				$container->get( PrintEndpoint::class )->detect();
			},
			1
		);

		return true;
	}
}
