/**
 * Fetch the TTF fonts dompdf.js embeds in the PDF.
 *
 * @param {Array<{family: string, weight: number, url: string}>} fonts Fonts from the config.
 * @return {Promise<Array>} dompdf.js fontConfig entries.
 */
export function loadFonts( fonts ) {
	return Promise.all(
		( fonts || [] ).map( ( font ) =>
			fetch( font.url, { credentials: 'same-origin' } )
				.then( ( res ) => {
					if ( ! res.ok ) {
						throw new Error( 'Font ' + font.url + ' HTTP ' + res.status );
					}
					return res.arrayBuffer();
				} )
				.then( ( buf ) => ( {
					fontFamily: font.family,
					fontWeight: font.weight,
					fontStyle: 'normal',
					fontBytes: new Uint8Array( buf ),
				} ) )
		)
	);
}
