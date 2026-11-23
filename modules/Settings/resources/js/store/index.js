/**
 * Settings store: a Redux store (through @wordpress/data) holding the saved
 * `dinamiko_pdf_settings` option and the unsaved edits made in the form.
 */
import { createReduxStore, register } from '@wordpress/data';

import reducer from './reducer';
import * as actions from './actions';
import * as selectors from './selectors';
import * as resolvers from './resolvers';

export const STORE_NAME = 'dinamiko-pdf/settings';

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
	resolvers,
} );

register( store );
