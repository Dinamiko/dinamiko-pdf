/**
 * Hooks registered by compatibility scripts (added through the `cpdf_print_enqueue` action):
 *
 *     window.cpdfHooks = window.cpdfHooks || {};
 *     ( window.cpdfHooks.beforeExport = window.cpdfHooks.beforeExport || [] ).push(
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
	const hooks = ( window.cpdfHooks && window.cpdfHooks[ name ] ) || [];
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
			console.warn( '[Content PDF] ' + name + ' hook failed', e );
		}
	}
}
