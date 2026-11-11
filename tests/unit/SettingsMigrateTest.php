<?php

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Tests\Unit;

use Dinamiko\ContentPdf\Settings\Settings;
use PHPUnit\Framework\TestCase;

class SettingsMigrateTest extends TestCase {

	public function test_old_footer_text_becomes_centered_footer_without_header(): void {
		$migrated = Settings::migrate(
			[
				'paper'       => 'letter',
				'footer_text' => 'Page ${currentPage}',
			]
		);

		$this->assertSame( 'letter', $migrated['paper'] );
		$this->assertSame( 'Page ${currentPage}', $migrated['footer_center'] );
		$this->assertSame( '', $migrated['footer_left'] );
		$this->assertSame( '', $migrated['footer_right'] );
		$this->assertSame( '', $migrated['header_right'] );
		$this->assertArrayNotHasKey( 'footer_text', $migrated );
	}

	public function test_empty_old_footer_stays_empty(): void {
		$migrated = Settings::migrate( [ 'footer_text' => '' ] );

		$this->assertSame( '', $migrated['footer_center'] );
	}

	public function test_new_settings_are_untouched(): void {
		$saved = [
			'footer_left' => 'x',
			'paper'       => 'a4',
		];

		$this->assertSame( $saved, Settings::migrate( $saved ) );
	}

	public function test_stale_footer_text_is_dropped_when_slots_exist(): void {
		$migrated = Settings::migrate(
			[
				'footer_text'  => 'old',
				'footer_right' => 'new',
			]
		);

		$this->assertSame( [ 'footer_right' => 'new' ], $migrated );
	}
}
