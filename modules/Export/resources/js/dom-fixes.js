/**
 * DOM preparation before export: workarounds for dompdf.js 2.0.x and page-break hints.
 */
import { replaceEmbeds } from './embeds';

function lastTextNode( el ) {
	const walker = document.createTreeWalker( el, NodeFilter.SHOW_TEXT );
	let node;
	let last = null;
	while ( ( node = walker.nextNode() ) ) {
		if ( node.data.length ) {
			last = node;
		}
	}
	return last;
}

/**
 * dompdf.js 2.0.x drops the leading space of a text node that follows an inline element
 * ("<code>x</code> and" → "xand"). Trailing spaces survive, so move the space to the end
 * of the preceding element's text; the browser layout is unchanged.
 *
 * @param {Element} root Exported element.
 */
export function fixInlineSpaces( root ) {
	const walker = document.createTreeWalker( root, NodeFilter.SHOW_TEXT );
	const nodes = [];
	let node;
	while ( ( node = walker.nextNode() ) ) {
		const prev = node.previousSibling;
		if (
			/^[ \t\r\n]/.test( node.data ) &&
			/\S/.test( node.data ) &&
			prev &&
			prev.nodeType === 1 &&
			! node.parentElement.closest( 'pre, textarea' )
		) {
			nodes.push( node );
		}
	}
	nodes.forEach( ( text ) => {
		const target = lastTextNode( text.previousSibling );
		text.data = text.data.replace( /^[ \t\r\n]+/, '' );
		if ( target ) {
			if ( ! /\s$/.test( target.data ) ) {
				target.data += ' ';
			}
		} else {
			// E.g. an <img> before the text: keep the gap with a no-break space.
			text.data = ' ' + text.data;
		}
	} );
}

/**
 * dompdf.js 2.0.x ignores `visibility` and does not check whether a pseudo-element is displayed:
 * - visibility:hidden elements would be printed → opacity 0 (keeps their box, which dompdf honours);
 * - a hidden ::before/::after with text (e.g. `content:"0.66"` layout hacks) would rasterise the
 *   whole element → drop that content.
 *
 * @param {Element} root Exported element.
 */
export function fixHiddenContent( root ) {
	const hidden = [];
	[ root, ...root.querySelectorAll( '*' ) ].forEach( ( el ) => {
		const cs = window.getComputedStyle( el );
		if ( cs.visibility !== 'visible' ) {
			hidden.push( el );
		}
		[ 'before', 'after' ].forEach( ( which ) => {
			const ps = window.getComputedStyle( el, '::' + which );
			if (
				ps.display === 'none' &&
				ps.content &&
				ps.content !== 'none' &&
				ps.content !== 'normal'
			) {
				el.classList.add( 'cpdf-no-' + which );
			}
		} );
	} );
	hidden.forEach( ( el ) => {
		// Children may opt back in with visibility:visible; leave those subtrees alone.
		const visibleChild = Array.from( el.querySelectorAll( '*' ) ).some(
			( child ) => window.getComputedStyle( child ).visibility === 'visible'
		);
		if ( ! visibleChild ) {
			el.style.setProperty( 'opacity', '0', 'important' );
		}
	} );
}

const KEEP_TOGETHER = [
	'figure',
	'img',
	'table',
	'pre',
	'blockquote',
	'.wp-block-columns',
	'.wp-block-media-text',
	'.wp-block-cover',
	'.wp-block-buttons',
	'.wp-block-gallery',
].join( ',' );

/**
 * Prepare the exported element: embeds, dompdf workarounds, page-break hints.
 *
 * @param {Element} root Exported element.
 */
export function prepareDom( root ) {
	replaceEmbeds( root );
	fixHiddenContent( root );
	fixInlineSpaces( root );

	root.querySelectorAll( KEEP_TOGETHER ).forEach( ( el ) => {
		el.setAttribute( 'divisionDisable', '' );
	} );

	// Keep headings with the block that follows them (best effort: tag both as unsplittable).
	root.querySelectorAll( 'h1, h2, h3, h4, h5, h6' ).forEach( ( h ) => {
		h.setAttribute( 'divisionDisable', '' );
		const next = h.nextElementSibling;
		if ( next && next.matches( 'p, ul, ol' ) && next.offsetHeight < 200 ) {
			next.setAttribute( 'divisionDisable', '' );
		}
	} );

	root.querySelectorAll( '.cpdf-page-break' ).forEach( ( el ) => {
		el.setAttribute( 'pageBreak', '' );
	} );
}
