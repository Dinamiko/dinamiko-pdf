/**
 * Content PDF — runs on the print page (?cpdf_print=1).
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

const config = window.cpdfConfig || {};
const i18n = config.i18n || {};
const article = document.querySelector( '.cpdf-article' );
const statusEl = document.querySelector( '.cpdf-status' );
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
	message.type = 'cpdf';
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

function fallback( error ) {
	if ( error ) {
		// eslint-disable-next-line no-console
		console.error( '[Content PDF]', error );
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
		prepareDom( article, config.pageHeightPx || 0 );

		const fontConfig = await loadFonts( config.fonts );
		const options = {
			format: config.format || 'a4',
			pagination: true,
			compress: true,
			useCORS: true,
			// The article is transparent; the page background comes from here (white paper by default).
			backgroundColor: document.body.classList.contains(
				'cpdf-theme-background'
			)
				? window.getComputedStyle( document.body ).backgroundColor
				: '#ffffff',
			marginPt: config.marginPt || 0,
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
		if ( config.footer ) {
			options.pageConfig = {
				footer: {
					content: config.footer,
					contentFontSize: 9,
					contentColor: '#666666',
				},
			};
		}

		const blob = await engine.render( article, options );
		const filename = config.filename || 'document.pdf';

		if ( embedded ) {
			send( { status: 'done', text: i18n.done, blob, filename } );
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
