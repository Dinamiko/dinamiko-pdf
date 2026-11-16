<?php

declare( strict_types=1 );

namespace Dinamiko\ContentPdf\Tests\Unit;

use Dinamiko\ContentPdf\Settings\Fonts;
use PHPUnit\Framework\TestCase;

class FontsTest extends TestCase {

	private function default(): array {
		return Fonts::bundled( 'https://example.com/wp-content/plugins/content-pdf/' );
	}

	public function test_default_is_kept_when_the_filter_removes_it(): void {
		$fonts = Fonts::normalize( [], $this->default() );

		$this->assertSame( [ Fonts::DEFAULT ], array_keys( $fonts ) );
		$this->assertSame( 'Noto Sans', $fonts[ Fonts::DEFAULT ]['label'] );
	}

	public function test_registered_font_is_normalized(): void {
		$fonts = Fonts::normalize(
			[
				'Merri Weather!' => [
					'label' => ' Merriweather ',
					'files' => [
						[ 'url' => 'https://example.com/m.ttf' ],
						[
							'url'    => '//example.com/m-bold-italic.ttf',
							'weight' => '1000',
							'style'  => 'italic',
						],
						[
							'url'    => 'https://example.com/m-light.ttf',
							'weight' => 330,
							'style'  => 'oblique',
						],
					],
				],
			],
			$this->default()
		);

		$this->assertSame(
			[
				'label' => 'Merriweather',
				'files' => [
					[
						'url'    => 'https://example.com/m.ttf',
						'weight' => 400,
						'style'  => 'normal',
					],
					[
						'url'    => '//example.com/m-bold-italic.ttf',
						'weight' => 900,
						'style'  => 'italic',
					],
					[
						'url'    => 'https://example.com/m-light.ttf',
						'weight' => 300,
						'style'  => 'normal',
					],
				],
			],
			$fonts['merriweather']
		);
		$this->assertArrayHasKey( Fonts::DEFAULT, $fonts );
	}

	public function test_invalid_entries_are_dropped(): void {
		$fonts = Fonts::normalize(
			[
				'no-files'  => [ 'label' => 'No files' ],
				'bad-urls'  => [
					'files' => [
						[ 'url' => 'javascript:alert(1)' ],
						[ 'url' => '/relative.ttf' ],
						[ 'url' => 'https://example.com/a b.ttf' ],
						'not-an-array',
					],
				],
				'!!!'       => [ 'files' => [ [ 'url' => 'https://example.com/x.ttf' ] ] ],
				'not-array' => 'nope',
				'no-label'  => [ 'files' => [ [ 'url' => 'https://example.com/x.ttf' ] ] ],
			],
			$this->default()
		);

		$this->assertSame( [ Fonts::DEFAULT, 'no-label' ], array_keys( $fonts ) );
		$this->assertSame( 'no-label', $fonts['no-label']['label'] );
	}

	public function test_overriding_the_default_font_is_allowed(): void {
		$fonts = Fonts::normalize(
			[ Fonts::DEFAULT => [ 'files' => [ [ 'url' => 'https://cdn.example.com/noto.ttf' ] ] ] ],
			$this->default()
		);

		$this->assertSame( 'https://cdn.example.com/noto.ttf', $fonts[ Fonts::DEFAULT ]['files'][0]['url'] );
	}

	public function test_library_families_keep_only_ttf_faces(): void {
		$fonts = Fonts::from_library(
			[
				[
					'name'  => 'Lora',
					'slug'  => 'lora',
					'faces' => [
						[
							'src'        => 'https://example.com/fonts/lora-regular.ttf',
							'fontWeight' => '400',
							'fontStyle'  => 'normal',
						],
						[
							'src'        => [ 'https://example.com/fonts/lora-bold.woff2', 'https://example.com/fonts/lora-bold.TTF?ver=2' ],
							'fontWeight' => 'bold',
						],
						[
							'src'        => 'https://example.com/fonts/lora-italic.woff2',
							'fontWeight' => '400',
							'fontStyle'  => 'italic',
						],
						[
							'src'        => 'https://example.com/fonts/lora-light-italic.ttf',
							'fontWeight' => '300',
							'fontStyle'  => 'italic',
						],
					],
				],
				[
					'name'  => 'Inter',
					'slug'  => 'inter',
					'faces' => [
						[
							'src'        => 'https://example.com/fonts/inter-variable.ttf',
							'fontWeight' => '100 900',
						],
					],
				],
				[
					'name'  => 'Only Woff',
					'slug'  => 'only-woff',
					'faces' => [ [ 'src' => 'https://example.com/fonts/only.woff2' ] ],
				],
			]
		);

		$this->assertSame( [ 'lora', 'inter' ], array_keys( $fonts ) );
		$this->assertSame(
			[
				'label' => 'Lora',
				'files' => [
					[
						'url'    => 'https://example.com/fonts/lora-regular.ttf',
						'weight' => 400,
						'style'  => 'normal',
					],
					[
						'url'    => 'https://example.com/fonts/lora-bold.TTF?ver=2',
						'weight' => 700,
						'style'  => 'normal',
					],
					[
						'url'    => 'https://example.com/fonts/lora-light-italic.ttf',
						'weight' => 300,
						'style'  => 'italic',
					],
				],
			],
			$fonts['lora']
		);
		$this->assertSame( 400, $fonts['inter']['files'][0]['weight'] );
	}

	public function test_library_weight_range_without_400_uses_its_lowest_weight(): void {
		$fonts = Fonts::from_library(
			[
				[
					'name'  => 'Display',
					'slug'  => 'display',
					'faces' => [
						[
							'src'        => 'https://example.com/display.ttf',
							'fontWeight' => '600 900',
						],
					],
				],
			]
		);

		$this->assertSame( 600, $fonts['display']['files'][0]['weight'] );
	}
}
