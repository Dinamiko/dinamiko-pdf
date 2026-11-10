/**
 * Image helpers: wait for <img> elements and inline CSS background images.
 */

function timeout( ms ) {
	return new Promise( ( resolve ) => setTimeout( resolve, ms ) );
}

/**
 * Resolve when every image in root has loaded or failed, or after timeoutMs.
 *
 * @param {Element} root      Element to scan.
 * @param {number}  timeoutMs Maximum wait.
 * @return {Promise<void>} Resolves when done.
 */
export function waitForImages( root, timeoutMs ) {
	const pending = Array.from( root.querySelectorAll( 'img' ) ).filter(
		( img ) => {
			// Loading is eager on this page, but the responsive srcset may still be in flight.
			img.loading = 'eager';
			return ! img.complete;
		}
	);
	const all = Promise.all(
		pending.map(
			( img ) =>
				new Promise( ( resolve ) => {
					img.addEventListener( 'load', resolve, { once: true } );
					img.addEventListener( 'error', resolve, { once: true } );
				} )
		)
	);
	return Promise.race( [ all, timeout( timeoutMs ) ] );
}

/**
 * CSS background images: dompdf.js draws them by rendering the element into an SVG image,
 * and SVG images never load external URLs. Inline each one as a data: URL first. This also
 * waits for them to load. Cross-origin images need CORS, otherwise they are left as is.
 *
 * @param {Element} root      Element to scan.
 * @param {number}  timeoutMs Maximum wait.
 * @return {Promise<void>} Resolves when done.
 */
export function inlineBackgroundImages( root, timeoutMs ) {
	const cache = {};

	function toDataUrl( url ) {
		if ( ! cache[ url ] ) {
			cache[ url ] = fetch( url, { credentials: 'same-origin' } )
				.then( ( res ) => {
					if ( ! res.ok ) {
						throw new Error( 'HTTP ' + res.status );
					}
					return res.blob();
				} )
				.then(
					( blob ) =>
						new Promise( ( resolve, reject ) => {
							const reader = new FileReader();
							reader.onload = () => resolve( reader.result );
							reader.onerror = reject;
							reader.readAsDataURL( blob );
						} )
				)
				.catch( () => null );
		}
		return cache[ url ];
	}

	const jobs = [];
	[ root, ...root.querySelectorAll( '*' ) ].forEach( ( el ) => {
		const bg = window.getComputedStyle( el ).backgroundImage;
		if ( ! bg || bg.indexOf( 'url(' ) === -1 ) {
			return;
		}
		const urls = [];
		bg.replace( /url\(["']?([^"')]+)["']?\)/g, ( m, url ) => {
			if ( ! /^data:/.test( url ) ) {
				urls.push( url );
			}
		} );
		if ( ! urls.length ) {
			return;
		}
		jobs.push(
			Promise.all( urls.map( toDataUrl ) ).then( ( data ) => {
				let value = bg;
				urls.forEach( ( url, i ) => {
					if ( data[ i ] ) {
						value = value.split( url ).join( data[ i ] );
					}
				} );
				if ( value !== bg ) {
					el.style.setProperty( 'background-image', value, 'important' );
				}
			} )
		);
	} );

	return Promise.race( [ Promise.all( jobs ), timeout( timeoutMs ) ] );
}
