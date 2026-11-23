/**
 * Dinamiko PDF settings page.
 */
import { createRoot } from '@wordpress/element';

import App from './components/App';
import { config } from './config';
import './style.scss';

const root = document.getElementById( config.rootId || 'dinamiko-pdf-settings-root' );
if ( root ) {
	createRoot( root ).render( <App /> );
}
