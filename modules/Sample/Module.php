<?php

namespace Dinamiko\ContentPdf\Sample;

use Inpsyde\Modularity\Module\ModuleClassNameIdTrait;
use Inpsyde\Modularity\Module\ServiceModule;
use Inpsyde\Modularity\Module\ExecutableModule;
use Inpsyde\Modularity\Package;
use Inpsyde\Modularity\Properties\Properties;
use Psr\Container\ContainerInterface;

class Module implements ServiceModule, ExecutableModule {
	use ModuleClassNameIdTrait;

	public function services(): array {
		return [];
	}

	public function run( ContainerInterface $container ): bool {
		add_action( 'admin_notices', function () {
			echo 'Sample message here.';
		} );

		add_action( 'admin_enqueue_scripts', static function () use ( $container ) {
			/** @var Properties $properties */
			$properties = $container->get( Package::PROPERTIES );
			$asset_file = $properties->basePath() . 'modules/Sample/build/index.asset.php';
			if ( ! is_readable( $asset_file ) ) {
				return;
			}
			$asset = require $asset_file;

			wp_register_script(
				'cpdf-sample',
				$properties->baseUrl() . 'modules/Sample/build/index.js',
				$asset['dependencies'],
				$asset['version'],
				true
			);
			wp_enqueue_script( 'cpdf-sample' );
		} );

		return true;
	}
}
