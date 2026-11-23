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
				el.classList.add( 'dinamiko-pdf-no-' + which );
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

const DROP_CAP_PROPS = [
	'float',
	'font-family',
	'font-size',
	'font-style',
	'font-weight',
	'line-height',
	'text-transform',
	'color',
	'vertical-align',
	'margin-top',
	'margin-right',
	'margin-bottom',
	'margin-left',
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
];

/**
 * dompdf.js 2.0.x cannot see `::first-letter`, so drop caps (`.has-drop-cap`) come out as a
 * normal-sized letter in a column of its own. Replace the pseudo-element with a real span that
 * carries its computed styles.
 *
 * @param {Element} root Exported element.
 */
export function fixDropCaps( root ) {
	root.querySelectorAll( '.has-drop-cap' ).forEach( ( p ) => {
		const walker = document.createTreeWalker( p, NodeFilter.SHOW_TEXT );
		let node;
		while ( ( node = walker.nextNode() ) && ! /\S/.test( node.data ) ) {
			// Skip whitespace-only text nodes.
		}
		if ( ! node ) {
			return;
		}
		const cs = window.getComputedStyle( p, '::first-letter' );
		const styles = DROP_CAP_PROPS.map( ( prop ) => [
			prop,
			cs.getPropertyValue( prop ),
		] );

		const start = node.data.search( /\S/ );
		// One character, or a surrogate pair.
		const letter = String.fromCodePoint( node.data.codePointAt( start ) );
		const letterNode = node.splitText( start );
		letterNode.splitText( letter.length );

		const span = document.createElement( 'span' );
		span.className = 'dinamiko-pdf-drop-cap';
		span.textContent = letter;
		styles.forEach( ( [ prop, value ] ) =>
			span.style.setProperty( prop, value )
		);
		// Without the class the ::first-letter rule no longer applies on top of the span.
		p.classList.remove( 'has-drop-cap' );
		letterNode.replaceWith( span );
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
 * A box with a background or border that crosses a page edge leaves a sliver of it (e.g. its
 * bottom padding) on the next page. Keep such boxes together when they are small enough.
 *
 * @param {Element} root      Exported element.
 * @param {number}  maxHeight Boxes up to this height (px) are kept together.
 */
export function keepBoxesTogether( root, maxHeight ) {
	root.querySelectorAll( '*' ).forEach( ( el ) => {
		const cs = window.getComputedStyle( el );
		if (
			cs.display.startsWith( 'inline' ) ||
			el.offsetHeight > maxHeight
		) {
			return;
		}
		const hasBackground =
			cs.backgroundImage !== 'none' ||
			! /^(transparent|rgba\(.*,\s*0\))$/.test( cs.backgroundColor );
		const hasBorder = [ 'Top', 'Right', 'Bottom', 'Left' ].some(
			( side ) =>
				parseFloat( cs[ 'border' + side + 'Width' ] ) > 0 &&
				cs[ 'border' + side + 'Style' ] !== 'none'
		);
		if ( hasBackground || hasBorder ) {
			el.setAttribute( 'divisionDisable', '' );
		}
	} );
}

/**
 * Prepare the exported element: embeds, dompdf workarounds, page-break hints.
 *
 * @param {Element} root         Exported element.
 * @param {number}  pageHeightPx Page height in CSS px (0 if unknown).
 */
export function prepareDom( root, pageHeightPx = 0 ) {
	replaceEmbeds( root );
	fixDropCaps( root );
	fixHiddenContent( root );
	fixInlineSpaces( root );

	root.querySelectorAll( KEEP_TOGETHER ).forEach( ( el ) => {
		el.setAttribute( 'divisionDisable', '' );
	} );

	if ( pageHeightPx > 0 ) {
		keepBoxesTogether( root, pageHeightPx / 2 );
	}

	// Keep headings with the block that follows them (best effort: tag both as unsplittable).
	root.querySelectorAll( 'h1, h2, h3, h4, h5, h6' ).forEach( ( h ) => {
		h.setAttribute( 'divisionDisable', '' );
		const next = h.nextElementSibling;
		if ( next && next.matches( 'p, ul, ol' ) && next.offsetHeight < 200 ) {
			next.setAttribute( 'divisionDisable', '' );
		}
	} );

	// dompdf.js 2.0.x adds about 20 blank pages when an element is both a page break and
	// unsplittable (e.g. a heading or figure with the class), so the page break wins.
	root.querySelectorAll( '.dinamiko-pdf-page-break' ).forEach( ( el ) => {
		el.setAttribute( 'pageBreak', '' );
		el.removeAttribute( 'divisionDisable' );
	} );
}
