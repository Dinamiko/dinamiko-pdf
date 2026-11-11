<?php
/**
 * PDF page footer.
 *
 * The dompdf.js engine cannot repeat HTML on every page, so this markup is never displayed. The exporter
 * reads it and draws it on each PDF page: every non-empty `[data-cpdf-slot]` becomes one line of
 * text (left, center or right), styled with the element's computed color, font-size, font-weight
 * and font-style. Text is plain: inline markup inside a slot is flattened.
 *
 * Themes can override this file. The first match wins (child theme, then parent theme):
 *
 *   content-pdf/footer-{post_type}-{slug}.php
 *   content-pdf/footer-{post_type}-{id}.php
 *   content-pdf/footer-{post_type}.php
 *   content-pdf/footer.php
 *
 * Keep the `data-cpdf-region="footer"` wrapper. `${currentPage}` and `${totalPages}` are
 * replaced on every page.
 *
 * Variables from PrintEndpoint::render_regions():
 *
 * @var \WP_Post              $post     Post being exported.
 * @var array                 $settings Plugin settings.
 * @var string                $region   `footer`.
 * @var array<string, string> $slots    Slot texts (left, center, right), {placeholders} resolved.
 *
 * @package Dinamiko\ContentPdf
 */

defined( 'ABSPATH' ) || exit;
?>
<div class="cpdf-region" data-cpdf-region="footer">
	<?php foreach ( $slots as $cpdf_position => $cpdf_text ) : ?>
		<span data-cpdf-slot="<?php echo esc_attr( $cpdf_position ); ?>"><?php echo esc_html( $cpdf_text ); ?></span>
	<?php endforeach; ?>
</div>
