/**
 * Settings page app.
 */
import { Button, Spinner, SnackbarList } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { DataForm, useFormValidity } from '@wordpress/dataviews/wp';
import { createInterpolateElement, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { store as noticesStore } from '@wordpress/notices';

import { fields } from '../fields';
import { form } from '../form';
import { store } from '../store';

function Notices() {
	const notices = useSelect(
		( select ) =>
			select( noticesStore )
				.getNotices()
				.filter( ( notice ) => notice.type === 'snackbar' ),
		[]
	);
	const { removeNotice } = useDispatch( noticesStore );
	return (
		<SnackbarList
			className="cpdf-settings__notices"
			notices={ notices }
			onRemove={ removeNotice }
		/>
	);
}

function Form( { settings } ) {
	const { hasEdits, isSaving } = useSelect(
		( select ) => ( {
			hasEdits: select( store ).hasEdits(),
			isSaving: select( store ).isSaving(),
		} ),
		[]
	);
	const { editSettings, save } = useDispatch( store );
	const { validity, isValid } = useFormValidity( settings, fields, form );

	// Warn before leaving with unsaved changes.
	useEffect( () => {
		if ( ! hasEdits ) {
			return;
		}
		const warn = ( event ) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener( 'beforeunload', warn );
		return () => window.removeEventListener( 'beforeunload', warn );
	}, [ hasEdits ] );

	const onSubmit = ( event ) => {
		event.preventDefault();
		if ( hasEdits && isValid && ! isSaving ) {
			save();
		}
	};

	return (
		<form className="cpdf-settings" onSubmit={ onSubmit }>
			<DataForm
				data={ settings }
				fields={ fields }
				form={ form }
				validity={ validity }
				onChange={ editSettings }
			/>
			<div>
				<Button
					type="submit"
					variant="primary"
					__next40pxDefaultSize
					isBusy={ isSaving }
					disabled={ ! hasEdits || ! isValid || isSaving }
					accessibleWhenDisabled
				>
					{ __( 'Save Changes', 'content-pdf' ) }
				</Button>
			</div>
			<p className="cpdf-settings__hint">
				{ createInterpolateElement(
					__(
						'Use the <code>[content_pdf_button]</code> shortcode to place the button anywhere, on any post type.',
						'content-pdf'
					),
					{ code: <code /> }
				) }
			</p>
		</form>
	);
}

export default function App() {
	const settings = useSelect(
		( select ) => select( store ).getSettings(),
		[]
	);

	return (
		<>
			{ settings ? <Form settings={ settings } /> : <Spinner /> }
			<Notices />
		</>
	);
}
