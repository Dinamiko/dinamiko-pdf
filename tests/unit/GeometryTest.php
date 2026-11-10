<?php

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Tests\Unit;

use Dinamiko\ContentPdf\Settings\Geometry;
use PHPUnit\Framework\TestCase;

class GeometryTest extends TestCase {

	public function test_a4_with_default_margin(): void {
		$geometry = Geometry::from_settings(
			[
				'paper'     => 'a4',
				'margin_mm' => 15,
			]
		);

		$this->assertSame( 'a4', $geometry['format'] );
		$this->assertSame( 42.52, $geometry['margin_pt'] );
		// (595.28 - 2 * 42.52) / 0.75 = 680.32.
		$this->assertSame( 680, $geometry['content_px'] );
		// (841.89 - 2 * 42.52) / 0.75 = 1009.13.
		$this->assertSame( 1009, $geometry['height_px'] );
		// floor(42.52 / 0.75) = 56, capped at 32.
		$this->assertSame( 32, $geometry['gutter_px'] );
		// Side margin = 42.52 - 32 * 0.75.
		$this->assertSame( [ 42.52, 18.52, 42.52, 18.52 ], $geometry['margin_box'] );
	}

	public function test_letter_uses_letter_size(): void {
		$geometry = Geometry::from_settings(
			[
				'paper'     => 'letter',
				'margin_mm' => 15,
			]
		);

		$this->assertSame( 'letter', $geometry['format'] );
		$this->assertSame( [ 612, 792 ], $geometry['page_pt'] );
		// (612 - 85.04) / 0.75 = 702.61.
		$this->assertSame( 702, $geometry['content_px'] );
	}

	public function test_small_margin_gutter_is_not_capped(): void {
		$geometry = Geometry::from_settings(
			[
				'paper'     => 'a4',
				'margin_mm' => 5,
			]
		);

		// 5mm = 14.17pt → floor(14.17 / 0.75) = 18px.
		$this->assertSame( 14.17, $geometry['margin_pt'] );
		$this->assertSame( 18, $geometry['gutter_px'] );
		$this->assertSame( 0.67, $geometry['margin_box'][1] );
	}

	public function test_zero_margin(): void {
		$geometry = Geometry::from_settings(
			[
				'paper'     => 'a4',
				'margin_mm' => 0,
			]
		);

		$this->assertSame( 0.0, $geometry['margin_pt'] );
		$this->assertSame( 0, $geometry['gutter_px'] );
		$this->assertSame( 793, $geometry['content_px'] );
		$this->assertSame( [ 0.0, 0.0, 0.0, 0.0 ], $geometry['margin_box'] );
	}

	public function test_unknown_paper_falls_back_to_a4(): void {
		$geometry = Geometry::from_settings( [ 'paper' => 'tabloid' ] );

		$this->assertSame( 'a4', $geometry['format'] );
		$this->assertSame( [ 595.28, 841.89 ], $geometry['page_pt'] );
	}
}
