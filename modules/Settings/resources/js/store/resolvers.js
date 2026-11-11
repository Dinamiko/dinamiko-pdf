/**
 * Settings store resolvers.
 */
import apiFetch from '@wordpress/api-fetch';

import { OPTION } from '../config';
import { receiveSettings } from './actions';

export const getSettings =
	() =>
	async ( { dispatch } ) => {
		const response = await apiFetch( {
			path: `/wp/v2/settings?_fields=${ OPTION }`,
		} );
		dispatch( receiveSettings( response[ OPTION ] ) );
	};
