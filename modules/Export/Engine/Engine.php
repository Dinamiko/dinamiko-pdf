<?php
/**
 * PDF engine contract.
 *
 * @package Dinamiko\DinamikoPdf
 */

declare( strict_types=1 );

namespace Dinamiko\DinamikoPdf\Export\Engine;

/**
 * An engine turns the print page into a PDF. The plugin ships a browser engine (dompdf.js);
 * other engines (e.g. server-side) can implement the same contract and be swapped in with `dinamiko_pdf_engine`.
 */
interface Engine {

	/**
	 * Unique engine id, e.g. "browser".
	 *
	 * @return string
	 */
	public function id(): string;

	/**
	 * Called on the print page before wp_head(); enqueue whatever the engine needs.
	 *
	 * @param array<string, mixed> $config Export config (paper, margins, footer, fonts, filename, metadata).
	 */
	public function enqueue_print_assets( array $config ): void;
}
