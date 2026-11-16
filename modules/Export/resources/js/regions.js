/**
 * Page header and footer: turns the markup printed by templates/header.php and footer.php
 * into dompdf.js `pageConfig` slots, and the header logo into a single image watermark.
 *
 * dompdf.js 2.0.x draws header/footer regions inside the content box (below `marginPt`), as
 * text only. So the top/bottom `marginPt` is set to 0 and each region is as tall as the page
 * margin: the regions fill the margins and the content area stays the same. The header can be
 * taller than the margin (`regions.headerExtraPt`); the content area is then shorter by that much.
 *
 * The only per-page image primitive is the tiled image watermark. Its grid starts at
 * (offsetX - pageWidth, offsetY - pageHeight) in PDF points (origin bottom-left) and repeats
 * every `spacing`. Spacing is 3× the page so exactly one tile lands on each page.
 */

const PT_PER_PX = 0.75;
const POSITIONS = {
	left: 'centerLeft',
	center: 'center',
	right: 'centerRight',
};
// Gap between the logo and the left slot, in px.
const LOGO_GAP_PX = 8;
// Share of the region height text and logo may use.
const FILL = 0.8;

function slotText( el ) {
	return ( el.textContent || '' ).replace( /\s+/g, ' ' ).trim();
}

function slotStyle( el, defaults, region, maxFontSize ) {
	const cs = window.getComputedStyle( el );
	const size =
		parseFloat( cs.fontSize ) ||
		( defaults.fontSize && defaults.fontSize[ region ] ) ||
		10;
	const weight = parseInt( cs.fontWeight, 10 ) || 400;
	return {
		color: cs.color || defaults.color || '#666666',
		fontSize: Math.min( size, maxFontSize ),
		// Only the regular and bold faces are registered.
		fontWeight: weight >= 600 ? 700 : 400,
		italic: cs.fontStyle === 'italic' || cs.fontStyle.startsWith( 'oblique' ),
		fontFamily: defaults.fontFamily || 'cpdf-body',
	};
}

/**
 * Size of the header logo in px, fitted into the region and half the content width.
 *
 * @param {HTMLImageElement} img       Logo.
 * @param {number}           maxHeight Max height in px.
 * @param {number}           maxWidth  Max width in px.
 * @return {{width: number, height: number}|null} Size, or null when the image did not load.
 */
function logoSize( img, maxHeight, maxWidth ) {
	if ( ! img || ! img.complete || ! img.naturalWidth || ! img.naturalHeight ) {
		return null;
	}
	const ratio = img.naturalWidth / img.naturalHeight;
	let height = Math.min(
		parseFloat( img.getAttribute( 'height' ) ) || img.naturalHeight,
		maxHeight
	);
	let width = height * ratio;
	if ( width > maxWidth ) {
		width = maxWidth;
		height = width / ratio;
	}
	return { width, height };
}

/**
 * Build the dompdf.js options for the header and footer.
 *
 * @param {Document} doc    Print document.
 * @param {Object}   config window.cpdfConfig.
 * @return {{options: Object, extraHeightPx: number}} dompdf.js options to merge (marginPt,
 *         pageWidthPt, pageHeightPt, pageConfig, watermark) and how much taller than the page
 *         margins the regions are, in px (the content area per page is shorter by that much).
 */
export function buildRegions( doc, config ) {
	const box = Array.isArray( config.marginPt )
		? config.marginPt
		: [ 0, 0, 0, 0 ].fill( Number( config.marginPt ) || 0 );
	const [ top, , bottom, left ] = box;
	const [ pageW, pageH ] = config.pagePt || [ 595.28, 841.89 ];
	const gutter = config.gutterPx || 0;
	const defaults = config.regions || {};
	const exclude = defaults.skipFirstPage ? [ 1 ] : [];

	const options = {
		marginPt: box,
		// Same size as the PHP geometry, so the watermark grid math matches.
		pageWidthPt: pageW,
		pageHeightPt: pageH,
		// An explicit object: without one, dompdf.js adds its own default header and footer.
		pageConfig: exclude.length ? { excludePages: exclude } : {},
	};

	const extraPt = Math.max( 0, Number( defaults.headerExtraPt ) || 0 );
	let extraHeightPx = 0;

	const regions = { header: top, footer: bottom };
	Object.keys( regions ).forEach( ( name ) => {
		// Region height: the page margin, plus the extra header spacing.
		const marginPt = regions[ name ] + ( name === 'header' ? extraPt : 0 );
		const el = doc.querySelector(
			`.cpdf-regions [data-cpdf-region="${ name }"]`
		);
		const heightPx = marginPt / PT_PER_PX;
		// A region needs room for at least a small line of text.
		if ( ! el || heightPx < 8 ) {
			return;
		}

		let logo = null;
		if ( name === 'header' ) {
			const img = el.querySelector( 'img.cpdf-region-logo' );
			const size = logoSize(
				img,
				heightPx * FILL,
				( config.contentWidthPx || 600 ) / 2
			);
			if ( size ) {
				logo = { url: img.currentSrc || img.src, ...size };
			}
		}

		const slots = [];
		el.querySelectorAll( '[data-cpdf-slot]' ).forEach( ( slotEl ) => {
			const content = slotText( slotEl );
			const which = slotEl.getAttribute( 'data-cpdf-slot' );
			if ( ! content || ! POSITIONS[ which ] ) {
				return;
			}
			let position = POSITIONS[ which ];
			if ( which === 'left' && logo ) {
				position = {
					x: logo.width + LOGO_GAP_PX,
					y: '50%',
					anchor: 'centerLeft',
				};
			}
			slots.push( {
				content,
				position,
				...slotStyle( slotEl, defaults, name, heightPx * FILL ),
			} );
		} );

		if ( ! slots.length && ! logo ) {
			return;
		}

		options.pageConfig[ name ] = {
			height: heightPx,
			// Align with the content edges: the side margin already excludes the gutter.
			padding: [ 0, gutter, 0, gutter ],
			slots,
		};
		options.marginPt = options.marginPt.slice();
		options.marginPt[ name === 'header' ? 0 : 2 ] = 0;
		extraHeightPx += ( marginPt - regions[ name ] ) / PT_PER_PX;

		if ( logo ) {
			const hPt = logo.height * PT_PER_PX;
			// Top-left corner of the logo, from the page's top-left, in pt.
			const x = left + gutter * PT_PER_PX;
			const y = ( marginPt - hPt ) / 2;
			options.watermark = {
				imageUrl: logo.url,
				imageWidth: logo.width,
				imageHeight: logo.height,
				angle: 0,
				opacity: 1,
				layer: 'over',
				spacing: [ ( 3 * pageW ) / PT_PER_PX, ( 3 * pageH ) / PT_PER_PX ],
				offset: [
					( pageW + x ) / PT_PER_PX,
					( 2 * pageH - y - hPt ) / PT_PER_PX,
				],
				excludePages: exclude,
			};
		}
	} );

	return { options, extraHeightPx };
}
