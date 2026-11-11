/**
 * DataForm Edit control for the header logo: WordPress media frame, preview and remove.
 */
import { BaseControl, Button } from '@wordpress/components';
import { useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { config } from '../config';

export default function LogoControl( { data, field, onChange } ) {
	const id = field.getValue( { item: data } ) || 0;
	const frame = useRef();
	// Preview URLs by attachment id; the saved logo's comes from PHP.
	const [ urls, setUrls ] = useState( () =>
		data.header_logo_id && config.logoUrl
			? { [ data.header_logo_id ]: config.logoUrl }
			: {}
	);
	const setId = ( value ) =>
		onChange( field.setValue( { item: data, value } ) );

	const open = () => {
		if ( ! frame.current ) {
			frame.current = window.wp.media( {
				title: __( 'Select header logo', 'content-pdf' ),
				button: { text: __( 'Use as logo', 'content-pdf' ) },
				library: { type: [ 'image/png', 'image/jpeg' ] },
				multiple: false,
			} );
		}
		// Re-bind on every open so the callback sees the current data.
		frame.current.off( 'select' ).on( 'select', () => {
			const attachment = frame.current
				.state()
				.get( 'selection' )
				.first()
				.toJSON();
			const size = attachment.sizes?.medium || attachment;
			setUrls( ( current ) => ( {
				...current,
				[ attachment.id ]: size.url,
			} ) );
			setId( attachment.id );
		} );
		frame.current.open();
	};

	return (
		<BaseControl
			__nextHasNoMarginBottom
			id="cpdf-header-logo"
			label={ field.label }
			help={ field.description }
			className="cpdf-logo-control"
		>
			{ id > 0 && urls[ id ] && (
				<img
					className="cpdf-logo-control__preview"
					src={ urls[ id ] }
					alt=""
				/>
			) }
			<div className="cpdf-logo-control__actions">
				<Button
					variant="secondary"
					__next40pxDefaultSize
					onClick={ open }
				>
					{ id > 0
						? __( 'Replace image', 'content-pdf' )
						: __( 'Select image', 'content-pdf' ) }
				</Button>
				{ id > 0 && (
					<Button
						variant="tertiary"
						isDestructive
						__next40pxDefaultSize
						onClick={ () => setId( 0 ) }
					>
						{ __( 'Remove', 'content-pdf' ) }
					</Button>
				) }
			</div>
		</BaseControl>
	);
}
