<?php
/**
 * PDF page footer.
 *
 * The dompdf.js engine cannot repeat HTML on every page, so this markup is never displayed. The exporter
 * reads it and draws it on each PDF page: every non-empty `[data-dinamiko-pdf-slot]` becomes one line of
 * text (left, center or right), styled with the element's computed color, font-size, font-weight
 * and font-style. Text is plain: inline markup inside a slot is flattened.
 *
 * Themes can override this file. The first match wins (child theme, then parent theme):
 *
 *   dinamiko-pdf/footer-{post_type}-{slug}.php
 *   dinamiko-pdf/footer-{post_type}-{id}.php
 *   dinamiko-pdf/footer-{post_type}.php
 *   dinamiko-pdf/footer.php
 *
 * Keep the `data-dinamiko-pdf-region="footer"` wrapper. `${currentPage}` and `${totalPages}` are
 * replaced on every page.
 *
 * Variables from PrintEndpoint::render_regions():
 *
 * @var \WP_Post              $post     Post being exported.
 * @var array                 $settings Plugin settings.
 * @var string                $region   `footer`.
 * @var array<string, string> $slots    Slot texts (left, center, right), {placeholders} resolved.
 *
 * @package Dinamiko\DinamikoPdf
 */

defined( 'ABSPATH' ) || exit;
?>
<div class="dinamiko-pdf-region" data-dinamiko-pdf-region="footer">
	<?php foreach ( $slots as $dinamiko_pdf_position => $dinamiko_pdf_text ) : ?>
		<span data-dinamiko-pdf-slot="<?php echo esc_attr( $dinamiko_pdf_position ); ?>"><?php echo esc_html( $dinamiko_pdf_text ); ?></span>
	<?php endforeach; ?>
</div>
