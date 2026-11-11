/**
 * Settings store actions.
 */
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { store as noticesStore } from '@wordpress/notices';

import { OPTION } from '../config';

export function receiveSettings( settings ) {
	return { type: 'RECEIVE_SETTINGS', settings };
}

export function editSettings( edits ) {
	return { type: 'EDIT_SETTINGS', edits };
}

/**
 * Save the edited settings. The response holds the sanitized option, so the
 * form shows what was stored (e.g. clamped values), not what was typed.
 */
export const save =
	() =>
	async ( { select, dispatch, registry } ) => {
		const notices = registry.dispatch( noticesStore );
		dispatch( { type: 'SAVE_START' } );
		try {
			const response = await apiFetch( {
				path: '/wp/v2/settings',
				method: 'POST',
				data: { [ OPTION ]: select.getSettings() },
			} );
			dispatch( receiveSettings( response[ OPTION ] ) );
			notices.createSuccessNotice(
				__( 'Settings saved.', 'content-pdf' ),
				{
					id: 'cpdf-settings-save',
					type: 'snackbar',
				}
			);
		} catch ( error ) {
			notices.createErrorNotice(
				error?.message ||
					__( 'The settings could not be saved.', 'content-pdf' ),
				{ id: 'cpdf-settings-save', type: 'snackbar' }
			);
		} finally {
			dispatch( { type: 'SAVE_FINISH' } );
		}
	};
