/**
 * Settings store reducer.
 */
const DEFAULT_STATE = {
	// Settings as returned by the REST API, null until loaded.
	saved: null,
	// Unsaved changes, keyed by setting.
	edits: {},
	isSaving: false,
};

export default function reducer( state = DEFAULT_STATE, action ) {
	switch ( action.type ) {
		case 'RECEIVE_SETTINGS':
			return { ...state, saved: action.settings, edits: {} };
		case 'EDIT_SETTINGS':
			return { ...state, edits: { ...state.edits, ...action.edits } };
		case 'SAVE_START':
			return { ...state, isSaving: true };
		case 'SAVE_FINISH':
			return { ...state, isSaving: false };
	}
	return state;
}
