<?php
/**
 * Button block module.
 *
 * @package Dinamiko\ContentPdf
 */

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\ButtonBlock;

use Dinamiko\ContentPdf\Button\Button;
use Dinamiko\ContentPdf\Export\PrintEndpoint;
use Dinamiko\ContentPdf\Settings\Settings;
use Inpsyde\Modularity\Module\ExecutableModule;
use Inpsyde\Modularity\Module\ModuleClassNameIdTrait;
use Inpsyde\Modularity\Module\ServiceModule;
use Inpsyde\Modularity\Package;
use Psr\Container\ContainerInterface;

/**
 * Provides the "PDF Button" block.
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
			ButtonBlock::class => static fn( ContainerInterface $container ): ButtonBlock => new ButtonBlock(
				$container->get( Button::class ),
				$container->get( PrintEndpoint::class ),
				$container->get( Settings::class ),
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
			'init',
			static function () use ( $container ): void {
				$container->get( ButtonBlock::class )->register();
			}
		);

		return true;
	}
}
