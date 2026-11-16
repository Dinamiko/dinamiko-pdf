/**
 * Fetch the TTF fonts dompdf.js embeds in the PDF.
 *
 * @param {Array<{family: string, weight: number, style: string, url: string}>} fonts Fonts from the config.
 * @return {Promise<Array>} dompdf.js fontConfig entries.
 */
export function loadFonts( fonts ) {
	// The body and heading families can share files; fetch each URL once.
	const requests = new Map();
	const fetchBytes = ( url ) => {
		if ( ! requests.has( url ) ) {
			requests.set(
				url,
				fetch( url, { credentials: 'same-origin' } )
					.then( ( res ) => {
						if ( ! res.ok ) {
							throw new Error(
								'Font ' + url + ' HTTP ' + res.status
							);
						}
						return res.arrayBuffer();
					} )
					.then( ( buf ) => new Uint8Array( buf ) )
			);
		}
		return requests.get( url );
	};

	return Promise.all(
		( fonts || [] ).map( ( font ) =>
			fetchBytes( font.url ).then( ( bytes ) => ( {
				fontFamily: font.family,
				fontWeight: font.weight || 400,
				fontStyle: font.style === 'italic' ? 'italic' : 'normal',
				// A copy per entry, in case the engine transfers or detaches the buffer.
				fontBytes: bytes.slice(),
			} ) )
		)
	);
}
