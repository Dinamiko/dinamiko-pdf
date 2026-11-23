<?php
/**
 * Settings module.
 *
 * @package Dinamiko\DinamikoPdf
 */

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\Settings;

use Inpsyde\Modularity\Module\ExecutableModule;
use Inpsyde\Modularity\Module\ModuleClassNameIdTrait;
use Inpsyde\Modularity\Module\ServiceModule;
use Inpsyde\Modularity\Package;
use Psr\Container\ContainerInterface;

/**
 * Provides the settings service and the admin settings page.
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
			Settings::class     => static fn(): Settings => new Settings(),
			Fonts::class        => static fn( ContainerInterface $container ): Fonts => new Fonts(
				(string) $container->get( Package::PROPERTIES )->baseUrl()
			),
			SettingsPage::class => static fn( ContainerInterface $container ): SettingsPage => new SettingsPage(
				$container->get( Settings::class ),
				$container->get( Fonts::class ),
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
			'admin_menu',
			static function () use ( $container ): void {
				$container->get( SettingsPage::class )->add_page();
			}
		);
		add_action(
			'admin_enqueue_scripts',
			static function ( $hook_suffix ) use ( $container ): void {
				$container->get( SettingsPage::class )->enqueue_assets( (string) $hook_suffix );
			}
		);
		add_action(
			'init',
			static function () use ( $container ): void {
				$container->get( SettingsPage::class )->register();
			}
		);
		add_filter(
			'rest_pre_get_setting',
			static function ( $value, $name ) use ( $container ) {
				return $container->get( SettingsPage::class )->rest_value( $value, (string) $name );
			},
			10,
			2
		);

		return true;
	}
}
