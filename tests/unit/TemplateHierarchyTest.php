<?php

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\Tests\Unit;

use Dinamiko\DinamikoPdf\Export\TemplateHierarchy;
use PHPUnit\Framework\TestCase;

class TemplateHierarchyTest extends TestCase {

	public function test_most_specific_first(): void {
		$this->assertSame(
			[
				'dinamiko-pdf/print-post-hello-world.php',
				'dinamiko-pdf/print-post-42.php',
				'dinamiko-pdf/print-post.php',
				'dinamiko-pdf/print.php',
			],
			TemplateHierarchy::candidates( 'post', 'hello-world', 42 )
		);
	}

	public function test_empty_slug_is_skipped(): void {
		$this->assertSame(
			[
				'dinamiko-pdf/print-page-7.php',
				'dinamiko-pdf/print-page.php',
				'dinamiko-pdf/print.php',
			],
			TemplateHierarchy::candidates( 'page', '', 7 )
		);
	}

	public function test_encoded_slug_tries_decoded_then_encoded(): void {
		$this->assertSame(
			[
				'dinamiko-pdf/print-post-café.php',
				'dinamiko-pdf/print-post-caf%c3%a9.php',
				'dinamiko-pdf/print-post-3.php',
				'dinamiko-pdf/print-post.php',
				'dinamiko-pdf/print.php',
			],
			TemplateHierarchy::candidates( 'post', 'caf%c3%a9', 3 )
		);
	}

	public function test_without_post_type_only_generic(): void {
		$this->assertSame(
			[ 'dinamiko-pdf/print.php' ],
			TemplateHierarchy::candidates( '', 'slug', 1 )
		);
	}

	public function test_header_and_footer_names(): void {
		$this->assertSame(
			[
				'dinamiko-pdf/header-post-hello-world.php',
				'dinamiko-pdf/header-post-42.php',
				'dinamiko-pdf/header-post.php',
				'dinamiko-pdf/header.php',
			],
			TemplateHierarchy::candidates( 'post', 'hello-world', 42, 'header' )
		);
		$this->assertSame(
			[ 'dinamiko-pdf/footer-page.php', 'dinamiko-pdf/footer.php' ],
			TemplateHierarchy::candidates( 'page', '', 0, 'footer' )
		);
	}

	public function test_unknown_name_falls_back_to_print(): void {
		$this->assertSame(
			[ 'dinamiko-pdf/print.php' ],
			TemplateHierarchy::candidates( '', '', 0, '../evil' )
		);
	}
}
