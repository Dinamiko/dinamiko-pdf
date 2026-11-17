/**
 * Content PDF — "PDF Button" block (editor).
 *
 * A dynamic block: PHP renders the same markup as the [content_pdf_button] shortcode.
 * The editor shows a button with the theme's button styles and an editable label.
 */
import { registerBlockType } from '@wordpress/blocks';
import {
	InspectorControls,
	RichText,
	useBlockProps,
} from '@wordpress/block-editor';
import { PanelBody, SelectControl, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import metadata from '../../block.json';

const settingAction = window.cpdfBlock?.action || 'download';
const settingLabel = ( window.cpdfBlock?.label || '' ).trim();

function defaultLabel( action ) {
	if ( settingLabel ) {
		return settingLabel;
	}
	return 'view' === ( action || settingAction )
		? __( 'View PDF', 'content-pdf' )
		: __( 'Download PDF', 'content-pdf' );
}

function Edit( { attributes, setAttributes } ) {
	const { label, action, postId } = attributes;
	const blockProps = useBlockProps( { className: 'wp-block-buttons' } );

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Settings', 'content-pdf' ) }>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Button text', 'content-pdf' ) }
						help={ __(
							'Leave empty to use the text from Settings → Content PDF.',
							'content-pdf'
						) }
						placeholder={ defaultLabel( action ) }
						value={ label }
						onChange={ ( value ) =>
							setAttributes( { label: value } )
						}
					/>
					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={ __( 'Button action', 'content-pdf' ) }
						value={ action }
						options={ [
							{
								label: __(
									'Use the plugin setting',
									'content-pdf'
								),
								value: '',
							},
							{
								label: __( 'Download the PDF', 'content-pdf' ),
								value: 'download',
							},
							{
								label: __(
									'Open the PDF in a new tab',
									'content-pdf'
								),
								value: 'view',
							},
						] }
						onChange={ ( value ) =>
							setAttributes( { action: value } )
						}
					/>
					<TextControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						type="number"
						min={ 0 }
						label={ __( 'Post ID', 'content-pdf' ) }
						help={ __(
							'Leave empty to export the current post.',
							'content-pdf'
						) }
						value={ postId ? String( postId ) : '' }
						onChange={ ( value ) =>
							setAttributes( {
								postId: Math.max( 0, parseInt( value, 10 ) || 0 ),
							} )
						}
					/>
				</PanelBody>
			</InspectorControls>
			<div { ...blockProps }>
				<div className="wp-block-button">
					<RichText
						tagName="span"
						className="wp-block-button__link wp-element-button"
						aria-label={ __( 'Button text', 'content-pdf' ) }
						placeholder={ defaultLabel( action ) }
						value={ label }
						onChange={ ( value ) =>
							setAttributes( { label: value } )
						}
						allowedFormats={ [] }
						withoutInteractiveFormatting
					/>
				</div>
			</div>
		</>
	);
}

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
