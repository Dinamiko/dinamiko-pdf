/**
 * Settings store selectors.
 */
import { createSelector } from '@wordpress/data';

/**
 * Saved settings with the unsaved edits applied, or null while loading.
 */
export const getSettings = createSelector(
	( state ) => ( state.saved ? { ...state.saved, ...state.edits } : null ),
	( state ) => [ state.saved, state.edits ]
);

/**
 * Whether any edit differs from the saved value.
 *
 * @param {Object} state Store state.
 * @return {boolean} Whether there are unsaved changes.
 */
export function hasEdits( state ) {
	return Object.entries( state.edits ).some(
		( [ key, value ] ) =>
			JSON.stringify( value ) !== JSON.stringify( state.saved?.[ key ] )
	);
}

export function isSaving( state ) {
	return state.isSaving;
}
