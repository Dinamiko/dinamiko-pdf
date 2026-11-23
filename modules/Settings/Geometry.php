<?php
/**
 * Page geometry shared by PHP (CSS width) and JS (dompdf.js options).
 *
 * @package Dinamiko\DinamikoPdf
 */

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\Settings;

/**
 * Converts paper size and margins into the numbers the print page and the exporter need.
 */
class Geometry {

	/**
	 * Paper sizes in PDF points (1pt = 1/72 in).
	 */
	public const PAPER_SIZES = [
		'a4'     => [ 595.28, 841.89 ],
		'letter' => [ 612, 792 ],
	];

	/**
	 * Maximum side gutter in CSS px.
	 */
	public const MAX_GUTTER_PX = 32;

	/**
	 * Compute the page geometry.
	 *
	 * The article gets a side gutter carved out of the page margin: dompdf.js clips anything left or right
	 * of the exported element, and list markers (and other overhangs) sit outside the content box.
	 * Content width and the visible page margins stay the same.
	 *
	 * @param array{paper?: string, margin_mm?: int|float} $settings Settings (paper, margin_mm).
	 * @return array{format: string, margin_pt: float, page_pt: array<int, float|int>, content_px: int, gutter_px: int, height_px: int, margin_box: float[]}
	 */
	public static function from_settings( array $settings ): array {
		$paper     = isset( $settings['paper'], self::PAPER_SIZES[ $settings['paper'] ] ) ? $settings['paper'] : 'a4';
		$page_pt   = self::PAPER_SIZES[ $paper ];
		$margin_mm = max( 0, (float) ( $settings['margin_mm'] ?? 0 ) );
		$margin_pt = round( $margin_mm * 72 / 25.4, 2 );

		// CSS px are 1/96 in, PDF pt 1/72 in → 1px = 0.75pt.
		$content_px = (int) floor( ( $page_pt[0] - 2 * $margin_pt ) / 0.75 );
		$gutter_px  = (int) min( self::MAX_GUTTER_PX, floor( $margin_pt / 0.75 ) );
		// Printable height per page (the footer is drawn inside the bottom margin).
		$height_px = (int) floor( ( $page_pt[1] - 2 * $margin_pt ) / 0.75 );
		$side_pt   = round( $margin_pt - $gutter_px * 0.75, 2 );

		return [
			'format'     => $paper,
			'margin_pt'  => $margin_pt,
			'page_pt'    => $page_pt,
			'content_px' => $content_px,
			'gutter_px'  => $gutter_px,
			'height_px'  => $height_px,
			// dompdf.js marginPt order: top, right, bottom, left.
			'margin_box' => [ $margin_pt, $side_pt, $margin_pt, $side_pt ],
		];
	}
}
