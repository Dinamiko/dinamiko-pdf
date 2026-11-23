/**
 * Iframes, videos and embeds cannot go into a PDF: replace them with a link box.
 */

function youtubeId( url ) {
	const m = String( url ).match(
		/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/
	);
	return m ? m[ 1 ] : '';
}

/**
 * Link box that stands in for media that cannot go into a PDF (iframes, video).
 *
 * @param {string} url       Media URL.
 * @param {string} title     Media title.
 * @param {string} posterUrl Optional poster image URL.
 * @return {HTMLAnchorElement} Placeholder element.
 */
export function embedPlaceholder( url, title, posterUrl ) {
	let href = url;
	const id = youtubeId( url );
	if ( id ) {
		href = 'https://www.youtube.com/watch?v=' + id;
	}
	const box = document.createElement( 'a' );
	box.className = 'dinamiko-pdf-embed-placeholder';
	box.setAttribute( 'divisionDisable', '' );
	box.href = href ? new URL( href, window.location.href ).href : '#';
	if ( posterUrl ) {
		const poster = document.createElement( 'img' );
		poster.src = posterUrl;
		poster.alt = '';
		box.appendChild( poster );
	}
	box.appendChild(
		document.createTextNode(
			( title || 'Media' ) + ( box.href !== '#' ? ': ' + box.href : '' )
		)
	);
	return box;
}

/**
 * Replace iframes, videos, embeds and objects with placeholders.
 *
 * @param {Element} root Exported element.
 */
export function replaceEmbeds( root ) {
	root.querySelectorAll( 'iframe, video, embed, object' ).forEach( ( el ) => {
		let src = el.getAttribute( 'src' ) || el.getAttribute( 'data' ) || '';
		if ( ! src && el.tagName === 'VIDEO' ) {
			const source = el.querySelector( 'source' );
			src = source ? source.getAttribute( 'src' ) : '';
		}
		const box = embedPlaceholder(
			src,
			el.getAttribute( 'title' ),
			el.tagName === 'VIDEO' ? el.poster : ''
		);
		// Embeds are wrapped in a responsive container with padding-top ratio; drop that too.
		const wrapper = el.closest( '.wp-block-embed__wrapper' );
		( wrapper || el ).replaceWith( box );
	} );
	root.querySelectorAll( '.wp-has-aspect-ratio' ).forEach( ( el ) => {
		el.classList.remove( 'wp-has-aspect-ratio' );
	} );
}
