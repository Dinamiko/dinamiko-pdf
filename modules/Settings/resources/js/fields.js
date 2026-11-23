/**
 * DataForm field definitions for the `dinamiko_pdf_settings` option.
 */
import { __ } from '@wordpress/i18n';

import { config, limits } from './config';
import CheckboxListControl from './components/CheckboxListControl';
import LogoControl from './components/LogoControl';

const integer = ( id, label, min, max, description ) => ( {
	id,
	label,
	description,
	type: 'integer',
	isValid: { required: true, min, max },
} );

const slot = ( id, label ) => ( { id, label, type: 'text' } );

export const fields = [
	{
		id: 'post_types',
		label: __( 'Show button on', 'dinamiko-pdf' ),
		type: 'array',
		elements: config.postTypes || [],
		Edit: CheckboxListControl,
	},
	{
		id: 'button_action',
		label: __( 'Button action', 'dinamiko-pdf' ),
		description: __(
			'The shortcode can override this with action="download" or action="view".',
			'dinamiko-pdf'
		),
		type: 'text',
		Edit: 'radio',
		elements: [
			{
				value: 'download',
				label: __( 'Download the PDF', 'dinamiko-pdf' ),
			},
			{
				value: 'view',
				label: __( 'Open the PDF in a new tab', 'dinamiko-pdf' ),
			},
		],
		isValid: { required: true, elements: true },
	},
	{
		id: 'button_label',
		label: __( 'Button text', 'dinamiko-pdf' ),
		description: __(
			'Used by every button, including the PDF Button block and the shortcode when they have no text of their own. Leave empty to use "Download PDF", or "View PDF" when the button opens the PDF in a new tab.',
			'dinamiko-pdf'
		),
		type: 'text',
	},
	{
		id: 'button_position',
		label: __( 'Button position', 'dinamiko-pdf' ),
		description: __(
			'Where the automatic button goes. The shortcode places it wherever you put it.',
			'dinamiko-pdf'
		),
		type: 'text',
		Edit: 'radio',
		elements: [
			{
				value: 'before',
				label: __( 'Before the content', 'dinamiko-pdf' ),
			},
			{
				value: 'after',
				label: __( 'After the content', 'dinamiko-pdf' ),
			},
		],
		isValid: { required: true, elements: true },
	},
	{
		id: 'paper',
		label: __( 'Paper size', 'dinamiko-pdf' ),
		type: 'text',
		Edit: 'select',
		elements: config.papers || [],
		isValid: { required: true, elements: true },
	},
	integer(
		'margin_mm',
		__( 'Page margins (mm)', 'dinamiko-pdf' ),
		0,
		limits.marginMax
	),
	{
		id: 'show_title',
		label: __( 'Show the post title', 'dinamiko-pdf' ),
		type: 'boolean',
		Edit: 'toggle',
	},
	{
		id: 'show_featured_image',
		label: __( 'Show the featured image', 'dinamiko-pdf' ),
		description: __(
			'Printed below the title, at the full content width.',
			'dinamiko-pdf'
		),
		type: 'boolean',
		Edit: 'toggle',
	},
	{
		id: 'font_body',
		label: __( 'PDF font', 'dinamiko-pdf' ),
		description: __(
			'Used for all text. Fonts uploaded to the Font Library (Appearance → Editor → Styles → Typography) are listed here when they include TTF files; WOFF and WOFF2 files are not supported.',
			'dinamiko-pdf'
		),
		type: 'text',
		Edit: 'select',
		elements: config.fonts || [],
		isValid: { required: true, elements: true },
	},
	{
		id: 'font_heading',
		label: __( 'Heading font', 'dinamiko-pdf' ),
		description: __(
			'Used for the post title and headings.',
			'dinamiko-pdf'
		),
		type: 'text',
		Edit: 'select',
		elements: [
			{ value: '', label: __( 'Same as the PDF font', 'dinamiko-pdf' ) },
			...( config.fonts || [] ),
		],
	},
	{
		id: 'header_logo_id',
		label: __( 'Header logo', 'dinamiko-pdf' ),
		description: __(
			'PNG or JPEG. Drawn at the left of the header; it is scaled down if it does not fit in the top margin.',
			'dinamiko-pdf'
		),
		type: 'integer',
		Edit: LogoControl,
	},
	integer(
		'header_logo_height',
		__( 'Logo height (px)', 'dinamiko-pdf' ),
		limits.logoHeightMin,
		limits.logoHeightMax
	),
	slot( 'header_left', __( 'Header left', 'dinamiko-pdf' ) ),
	slot( 'header_center', __( 'Header center', 'dinamiko-pdf' ) ),
	slot( 'header_right', __( 'Header right', 'dinamiko-pdf' ) ),
	slot( 'footer_left', __( 'Footer left', 'dinamiko-pdf' ) ),
	slot( 'footer_center', __( 'Footer center', 'dinamiko-pdf' ) ),
	slot( 'footer_right', __( 'Footer right', 'dinamiko-pdf' ) ),
	integer(
		'header_spacing_mm',
		__( 'Header spacing (mm)', 'dinamiko-pdf' ),
		0,
		limits.headerSpacingMax,
		__(
			'Extra height added to the header, on top of the page margin. The logo and text stay vertically centered; the content starts lower by the same amount.',
			'dinamiko-pdf'
		)
	),
	integer(
		'header_font_size',
		__( 'Header font size (px)', 'dinamiko-pdf' ),
		limits.fontSizeMin,
		limits.fontSizeMax
	),
	integer(
		'footer_font_size',
		__( 'Footer font size (px)', 'dinamiko-pdf' ),
		limits.fontSizeMin,
		limits.fontSizeMax
	),
	{
		id: 'hf_color',
		label: __( 'Text color', 'dinamiko-pdf' ),
		type: 'color',
		isValid: { required: true, pattern: '^#([0-9a-fA-F]{3}){1,2}$' },
	},
	{
		id: 'hf_skip_first_page',
		label: __(
			'Hide the header and footer on the first page',
			'dinamiko-pdf'
		),
		type: 'boolean',
		Edit: 'toggle',
	},
];
