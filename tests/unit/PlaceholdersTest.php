<?php

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\Tests\Unit;

use Dinamiko\DinamikoPdf\Export\Placeholders;
use PHPUnit\Framework\TestCase;

class PlaceholdersTest extends TestCase {

	private const VALUES = [
		'title' => 'Hello',
		'site'  => 'My Site',
		'date'  => 'May 1, 2026',
		'url'   => 'https://example.com/hello/',
	];

	public function test_replaces_post_placeholders(): void {
		$this->assertSame(
			'Hello — My Site — May 1, 2026 — https://example.com/hello/',
			Placeholders::replace( '{title} — {site} — {date} — {url}', self::VALUES )
		);
	}

	public function test_keeps_page_placeholders_for_dompdf(): void {
		$this->assertSame(
			'Hello: Page ${currentPage} / ${totalPages}',
			Placeholders::replace( '{title}: Page ${currentPage} / ${totalPages}', self::VALUES )
		);
	}

	public function test_unknown_placeholders_are_kept(): void {
		$this->assertSame( '{author} Hello', Placeholders::replace( '{author} {title}', self::VALUES ) );
	}

	public function test_missing_values_become_empty(): void {
		$this->assertSame( '[]', Placeholders::replace( '[{site}]', [] ) );
	}

	public function test_values_are_not_replaced_again(): void {
		$this->assertSame( '{site}', Placeholders::replace( '{title}', [ 'title' => '{site}' ] + self::VALUES ) );
	}
}
