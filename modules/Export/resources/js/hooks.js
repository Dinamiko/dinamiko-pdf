/**
 * Hooks registered by compatibility scripts (added through the `dinamiko_pdf_print_enqueue` action):
 *
 *     window.dinamikoPdfHooks = window.dinamikoPdfHooks || {};
 *     ( window.dinamikoPdfHooks.beforeExport = window.dinamikoPdfHooks.beforeExport || [] ).push(
 *         ( article, helpers ) => { … }
 *     );
 *
 * Each hook receives ( article, helpers ) and may return a Promise. A hook never stalls
 * or breaks the export: it times out after 10 s and errors are only logged.
 *
 * @param {string}  name    Hook name, e.g. "beforeExport".
 * @param {Element} root    Exported element.
 * @param {Object}  helpers Helpers passed to each hook.
 */
export async function runHooks( name, root, helpers ) {
	const hooks = ( window.dinamikoPdfHooks && window.dinamikoPdfHooks[ name ] ) || [];
	for ( const hook of hooks ) {
		try {
			await Promise.race( [
				hook( root, helpers ),
				new Promise( ( resolve, reject ) => {
					setTimeout( () => reject( new Error( 'timed out' ) ), 10000 );
				} ),
			] );
		} catch ( e ) {
			// eslint-disable-next-line no-console
			console.warn( '[Dinamiko PDF] ' + name + ' hook failed', e );
		}
	}
}
