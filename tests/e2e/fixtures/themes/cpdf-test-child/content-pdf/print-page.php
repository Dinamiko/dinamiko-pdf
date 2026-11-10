<?php
/**
 * E2E fixture: print template for pages.
 *
 * @package Dinamiko\ContentPdf
 */

defined( 'ABSPATH' ) || exit;

$cpdf_width = sprintf( '--cpdf-content-width: %dpx; --cpdf-gutter: %dpx', (int) $geometry['content_px'], (int) $geometry['gutter_px'] );
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<title><?php echo esc_html( wp_strip_all_tags( $title ) ); ?></title>
	<?php wp_head(); ?>
</head>
<body <?php body_class( $body_classes ); ?>>
	<p class="cpdf-status" role="status" aria-live="polite"></p>
	<article class="entry-content cpdf-article" style="<?php echo esc_attr( $cpdf_width ); ?>">
		<p class="cpdf-test-template">print-page.php</p>
		<h1><?php echo wp_kses_post( $title ); ?></h1>
		<?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
	</article>
	<?php wp_footer(); ?>
</body>
</html>
