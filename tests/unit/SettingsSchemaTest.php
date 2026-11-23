<?php

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\Tests\Unit;

use Dinamiko\DinamikoPdf\Settings\Settings;
use PHPUnit\Framework\TestCase;

class SettingsSchemaTest extends TestCase {

	public function test_schema_has_a_property_for_every_default(): void {
		$properties = Settings::schema()['properties'];

		$this->assertEqualsCanonicalizing( array_keys( Settings::defaults() ), array_keys( $properties ) );
	}

	public function test_defaults_match_the_schema(): void {
		$types = [
			'string'  => 'is_string',
			'integer' => 'is_int',
			'boolean' => 'is_bool',
			'array'   => 'is_array',
		];

		foreach ( Settings::schema()['properties'] as $key => $property ) {
			$value = Settings::defaults()[ $key ];

			$this->assertTrue( $types[ $property['type'] ]( $value ), "{$key} has the wrong type" );
			if ( isset( $property['enum'] ) ) {
				$this->assertContains( $value, $property['enum'], "{$key} is not in the enum" );
			}
			if ( isset( $property['minimum'] ) ) {
				$this->assertGreaterThanOrEqual( $property['minimum'], $value, "{$key} is below the minimum" );
			}
			if ( isset( $property['maximum'] ) ) {
				$this->assertLessThanOrEqual( $property['maximum'], $value, "{$key} is above the maximum" );
			}
		}
	}
}
