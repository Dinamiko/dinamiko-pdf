/**
 * DataForm layout: two cards, with the header/footer slots in rows.
 */
import { __ } from '@wordpress/i18n';

const row = { type: 'row' };

export const form = {
	layout: { type: 'regular' },
	fields: [
		{
			id: 'general',
			label: __( 'General', 'content-pdf' ),
			layout: { type: 'card', isCollapsible: false },
			children: [ 'post_types', 'button_action', 'paper', 'margin_mm' ],
		},
		{
			id: 'regions',
			label: __( 'Header & footer', 'content-pdf' ),
			description:
				__(
					'Shown on every PDF page, inside the top and bottom margins. Leave every slot of a region empty (and no logo, for the header) to turn it off. Themes can override the markup with content-pdf/header.php and content-pdf/footer.php.',
					'content-pdf'
				) +
				' ' +
				__( 'Placeholders:', 'content-pdf' ) +
				' {title} {site} {date} {url} ${currentPage} ${totalPages}',
			layout: { type: 'card', isCollapsible: false },
			children: [
				{
					id: 'logo',
					layout: row,
					children: [ 'header_logo_id', 'header_logo_height' ],
				},
				{
					id: 'header_text',
					layout: row,
					children: [
						'header_left',
						'header_center',
						'header_right',
					],
				},
				{
					id: 'footer_text',
					layout: row,
					children: [
						'footer_left',
						'footer_center',
						'footer_right',
					],
				},
				'header_spacing_mm',
				{
					id: 'style',
					layout: row,
					children: [
						'header_font_size',
						'footer_font_size',
						'hf_color',
					],
				},
				'hf_skip_first_page',
			],
		},
	],
};
