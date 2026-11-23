<?php
/**
 * E2E fixture: print template for the post with the slug dinamiko-pdf-hierarchy-post.
 *
 * @package Dinamiko\DinamikoPdf
 */

defined( 'ABSPATH' ) || exit;

$dinamiko_pdf_width = sprintf( '--dinamiko-pdf-content-width: %dpx; --dinamiko-pdf-gutter: %dpx', (int) $geometry['content_px'], (int) $geometry['gutter_px'] );
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<title><?php echo esc_html( wp_strip_all_tags( $title ) ); ?></title>
	<?php wp_head(); ?>
</head>
<body <?php body_class( $body_classes ); ?>>
	<p class="dinamiko-pdf-status" role="status" aria-live="polite"></p>
	<article class="entry-content dinamiko-pdf-article" style="<?php echo esc_attr( $dinamiko_pdf_width ); ?>">
		<p class="dinamiko-pdf-test-template">print-post-dinamiko-pdf-hierarchy-post.php</p>
		<h1><?php echo wp_kses_post( $title ); ?></h1>
		<?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
	</article>
	<?php wp_footer(); ?>
</body>
</html>
