<?php
/**
 * Content-only print document.
 *
 * Themes can override this file. The first match wins (child theme, then parent theme):
 *
 *   dinamiko-pdf/print-{post_type}-{slug}.php
 *   dinamiko-pdf/print-{post_type}-{id}.php
 *   dinamiko-pdf/print-{post_type}.php
 *   dinamiko-pdf/print.php
 *
 * Keep the `.dinamiko-pdf-article` element: it is what gets exported and what receives the PDF
 * content width. Keep wp_head() and wp_footer(): they load the exporter.
 *
 * Variables from PrintEndpoint::render():
 *
 * @var \WP_Post $post           Post being exported.
 * @var string   $content        Rendered post content.
 * @var string   $title          Post title.
 * @var array    $geometry       Page geometry.
 * @var bool     $is_block_theme Whether the active theme is a block theme.
 * @var string[] $body_classes   Extra body classes.
 * @var bool     $show_title     Whether to print the post title.
 * @var string   $featured_image Featured image markup, or empty when it is turned off or missing.
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
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="robots" content="noindex, nofollow">
	<title><?php echo esc_html( wp_strip_all_tags( $title ) ); ?></title>
	<?php wp_head(); ?>
</head>
<body <?php body_class( $body_classes ); ?>>
	<p class="dinamiko-pdf-status" role="status" aria-live="polite"></p>
	<?php if ( $is_block_theme ) : ?>
		<?php // Block themes style block classes via theme.json global styles. ?>
		<main class="wp-site-blocks">
			<article class="entry-content is-layout-constrained dinamiko-pdf-article" style="<?php echo esc_attr( $dinamiko_pdf_width ); ?>">
				<?php if ( $show_title ) : ?>
					<h1 class="wp-block-post-title"><?php echo wp_kses_post( $title ); ?></h1>
				<?php endif; ?>
				<?php if ( $featured_image ) : ?>
					<figure class="wp-block-post-featured-image dinamiko-pdf-featured-image">
						<?php echo $featured_image; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- get_the_post_thumbnail() output. ?>
					</figure>
				<?php endif; ?>
				<?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the_content output. ?>
			</article>
		</main>
	<?php else : ?>
		<?php // Classic themes style their own wrappers; mirror the common (Underscores / core default) structure. ?>
		<div class="dinamiko-pdf-article" style="<?php echo esc_attr( $dinamiko_pdf_width ); ?>">
			<div id="page" class="site">
				<div id="content" class="site-content">
					<div id="primary" class="content-area">
						<main id="main" class="site-main">
							<article id="post-<?php echo (int) $post->ID; ?>" <?php post_class( '', $post ); ?>>
								<?php if ( $show_title || $featured_image ) : ?>
									<header class="entry-header">
										<?php if ( $show_title ) : ?>
											<h1 class="entry-title"><?php echo wp_kses_post( $title ); ?></h1>
										<?php endif; ?>
										<?php if ( $featured_image ) : ?>
											<div class="post-thumbnail dinamiko-pdf-featured-image">
												<?php echo $featured_image; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- get_the_post_thumbnail() output. ?>
											</div>
										<?php endif; ?>
									</header>
								<?php endif; ?>
								<div class="entry-content">
									<?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the_content output. ?>
								</div>
							</article>
						</main>
					</div>
				</div>
			</div>
		</div>
	<?php endif; ?>
	<?php wp_footer(); ?>
</body>
</html>
