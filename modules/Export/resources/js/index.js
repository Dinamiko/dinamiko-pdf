/**
 * Dinamiko PDF — runs on the print page (?dinamiko_pdf_print=1).
 *
 * Top-level visit: exports and downloads the PDF directly.
 * Inside the button's hidden iframe: posts progress and the finished Blob to the parent.
 * On any failure: falls back to window.print() (the parent does this when embedded).
 */
import { embedPlaceholder } from './embeds';
import { waitForImages, inlineBackgroundImages } from './images';
import { prepareDom } from './dom-fixes';
import { loadFonts } from './fonts';
import { runHooks } from './hooks';
import { buildRegions } from './regions';

const config = window.dinamikoPdfConfig || {};
const i18n = config.i18n || {};
const article = document.querySelector( '.dinamiko-pdf-article' );
const regionsEl = document.querySelector( '.dinamiko-pdf-regions' );
const statusEl = document.querySelector( '.dinamiko-pdf-status' );
const embedded = window.parent !== window;

/**
 * Engine adapters. The browser engine uses dompdf.js (window.dompdf).
 */
const engines = {
	dompdf: {
		isSupported: () =>
			typeof window.Worker === 'function' &&
			typeof window.WebAssembly === 'object' &&
			typeof window.Blob === 'function' &&
			!! window.dompdf &&
			typeof window.dompdf.exportPDF === 'function',
		render: ( el, options ) => window.dompdf.exportPDF( el, options ),
	},
};

function format( str, ...args ) {
	return String( str || '' ).replace( /%(\d)\$d/g, ( m, n ) => args[ n - 1 ] );
}

function send( message ) {
	message.type = 'dinamiko-pdf';
	if ( statusEl && message.text ) {
		statusEl.textContent = message.text;
	}
	if ( embedded ) {
		try {
			window.parent.postMessage( message, window.location.origin );
		} catch ( e ) {}
	}
}

function download( blob, filename ) {
	const url = URL.createObjectURL( blob );
	const a = document.createElement( 'a' );
	a.href = url;
	a.download = filename;
	document.body.appendChild( a );
	a.click();
	a.remove();
	setTimeout( () => URL.revokeObjectURL( url ), 30000 );
}

/**
 * Show the PDF in this tab, in the browser's PDF viewer. Viewers save blob: PDFs under a
 * random name, so a toolbar link downloads it with the real filename.
 *
 * @param {Blob}   blob     PDF.
 * @param {string} filename File name.
 */
function showPdf( blob, filename ) {
	const url = URL.createObjectURL( blob );

	const toolbar = document.createElement( 'div' );
	toolbar.className = 'dinamiko-pdf-viewer-toolbar';
	const link = document.createElement( 'a' );
	link.href = url;
	link.download = filename;
	link.textContent = i18n.download || filename;
	toolbar.appendChild( link );

	const frame = document.createElement( 'iframe' );
	frame.className = 'dinamiko-pdf-viewer';
	frame.title = config.title || document.title;
	frame.src = url;

	document.body.classList.add( 'dinamiko-pdf-viewing' );
	document.body.append( toolbar, frame );
}

function fallback( error ) {
	if ( error ) {
		// eslint-disable-next-line no-console
		console.error( '[Dinamiko PDF]', error );
	}
	send( {
		status: 'error',
		text: i18n.failed,
		message: error ? String( error.message || error ) : '',
	} );
	if ( ! embedded ) {
		window.print();
	}
}

async function run() {
	if ( ! article ) {
		return;
	}
	if ( config.mode === 'print' ) {
		await document.fonts.ready;
		await waitForImages( article, 10000 );
		window.print();
		return;
	}

	const engine = engines.dompdf;
	if ( ! engine.isSupported() ) {
		fallback(
			new Error(
				'dompdf.js unavailable or browser lacks Worker/WebAssembly support'
			)
		);
		return;
	}

	try {
		send( { status: 'progress', text: i18n.preparing } );
		await document.fonts.ready;
		await waitForImages( article, 15000 );
		await runHooks( 'beforeExport', article, {
			embedPlaceholder,
			waitForImages,
			config,
		} );
		await inlineBackgroundImages( article, 15000 );
		await waitForImages( article, 5000 );
		if ( regionsEl ) {
			// The header logo.
			await waitForImages( regionsEl, 10000 );
		}
		// Header and footer (after the hooks, which may change their markup or the config).
		const regions = buildRegions( document, config );
		prepareDom(
			article,
			Math.max( 0, ( config.pageHeightPx || 0 ) - regions.extraHeightPx )
		);

		const fontConfig = await loadFonts( config.fonts );
		const options = {
			format: config.format || 'a4',
			pagination: true,
			compress: true,
			useCORS: true,
			// The article is transparent; the page background comes from here (white paper by default).
			backgroundColor: document.body.classList.contains(
				'dinamiko-pdf-theme-background'
			)
				? window.getComputedStyle( document.body ).backgroundColor
				: '#ffffff',
			fontConfig,
			metadata: {
				title: config.title || document.title,
				author: config.author || '',
			},
			onProgress: ( p ) => {
				if ( p.stage === 'rendering' && p.totalPages ) {
					send( {
						status: 'progress',
						text: format(
							i18n.rendering,
							p.currentPage || 1,
							p.totalPages
						),
						currentPage: p.currentPage,
						totalPages: p.totalPages,
					} );
				}
			},
		};
		Object.assign( options, regions.options );

		const blob = await engine.render( article, options );
		const filename = config.filename || 'document.pdf';

		if ( embedded ) {
			send( { status: 'done', text: i18n.done, blob, filename } );
		} else if ( config.mode === 'view' ) {
			showPdf( blob, filename );
			send( { status: 'done', text: '' } );
		} else {
			download( blob, filename );
			send( { status: 'done', text: i18n.done } );
		}
	} catch ( error ) {
		fallback( error );
	}
}

if ( document.readyState === 'complete' ) {
	run();
} else {
	window.addEventListener( 'load', run );
}
