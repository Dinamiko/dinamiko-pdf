/**
 * DataForm field definitions for the `cpdf_settings` option.
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
		label: __( 'Show button on', 'content-pdf' ),
		type: 'array',
		elements: config.postTypes || [],
		Edit: CheckboxListControl,
	},
	{
		id: 'button_action',
		label: __( 'Button action', 'content-pdf' ),
		description: __(
			'The shortcode can override this with action="download" or action="view".',
			'content-pdf'
		),
		type: 'text',
		Edit: 'radio',
		elements: [
			{
				value: 'download',
				label: __( 'Download the PDF', 'content-pdf' ),
			},
			{
				value: 'view',
				label: __( 'Open the PDF in a new tab', 'content-pdf' ),
			},
		],
		isValid: { required: true, elements: true },
	},
	{
		id: 'paper',
		label: __( 'Paper size', 'content-pdf' ),
		type: 'text',
		Edit: 'select',
		elements: config.papers || [],
		isValid: { required: true, elements: true },
	},
	integer(
		'margin_mm',
		__( 'Page margins (mm)', 'content-pdf' ),
		0,
		limits.marginMax
	),
	{
		id: 'show_title',
		label: __( 'Show the post title', 'content-pdf' ),
		type: 'boolean',
		Edit: 'toggle',
	},
	{
		id: 'show_featured_image',
		label: __( 'Show the featured image', 'content-pdf' ),
		description: __(
			'Printed below the title, at the full content width.',
			'content-pdf'
		),
		type: 'boolean',
		Edit: 'toggle',
	},
	{
		id: 'font_body',
		label: __( 'PDF font', 'content-pdf' ),
		description: __(
			'Used for all text. Developers can add fonts with the cpdf_fonts filter.',
			'content-pdf'
		),
		type: 'text',
		Edit: 'select',
		elements: config.fonts || [],
		isValid: { required: true, elements: true },
	},
	{
		id: 'font_heading',
		label: __( 'Heading font', 'content-pdf' ),
		description: __(
			'Used for the post title and headings.',
			'content-pdf'
		),
		type: 'text',
		Edit: 'select',
		elements: [
			{ value: '', label: __( 'Same as the PDF font', 'content-pdf' ) },
			...( config.fonts || [] ),
		],
	},
	{
		id: 'header_logo_id',
		label: __( 'Header logo', 'content-pdf' ),
		description: __(
			'PNG or JPEG. Drawn at the left of the header; it is scaled down if it does not fit in the top margin.',
			'content-pdf'
		),
		type: 'integer',
		Edit: LogoControl,
	},
	integer(
		'header_logo_height',
		__( 'Logo height (px)', 'content-pdf' ),
		limits.logoHeightMin,
		limits.logoHeightMax
	),
	slot( 'header_left', __( 'Header left', 'content-pdf' ) ),
	slot( 'header_center', __( 'Header center', 'content-pdf' ) ),
	slot( 'header_right', __( 'Header right', 'content-pdf' ) ),
	slot( 'footer_left', __( 'Footer left', 'content-pdf' ) ),
	slot( 'footer_center', __( 'Footer center', 'content-pdf' ) ),
	slot( 'footer_right', __( 'Footer right', 'content-pdf' ) ),
	integer(
		'header_spacing_mm',
		__( 'Header spacing (mm)', 'content-pdf' ),
		0,
		limits.headerSpacingMax,
		__(
			'Extra height added to the header, on top of the page margin. The logo and text stay vertically centered; the content starts lower by the same amount.',
			'content-pdf'
		)
	),
	integer(
		'header_font_size',
		__( 'Header font size (px)', 'content-pdf' ),
		limits.fontSizeMin,
		limits.fontSizeMax
	),
	integer(
		'footer_font_size',
		__( 'Footer font size (px)', 'content-pdf' ),
		limits.fontSizeMin,
		limits.fontSizeMax
	),
	{
		id: 'hf_color',
		label: __( 'Text color', 'content-pdf' ),
		type: 'color',
		isValid: { required: true, pattern: '^#([0-9a-fA-F]{3}){1,2}$' },
	},
	{
		id: 'hf_skip_first_page',
		label: __(
			'Hide the header and footer on the first page',
			'content-pdf'
		),
		type: 'boolean',
		Edit: 'toggle',
	},
];
