/**
 * Content PDF — "Download PDF" button.
 *
 * Loads the print page in an off-screen iframe (it needs real layout, so not display:none),
 * listens for progress via postMessage and downloads the Blob the print page sends back.
 * If the export fails, the print page is opened in a new tab with the print dialog.
 */
const strings = window.cpdfButton || {};
const TIMEOUT_MS = 120000;
let busy = false;

function download( blob, filename ) {
	const url = URL.createObjectURL( blob );
	const a = document.createElement( 'a' );
	a.href = url;
	a.download = filename || 'document.pdf';
	document.body.appendChild( a );
	a.click();
	a.remove();
	setTimeout( () => URL.revokeObjectURL( url ), 30000 );
}

function printUrl( url ) {
	const u = new URL( url, window.location.href );
	u.searchParams.set( 'cpdf_mode', 'print' );
	return u.href;
}

function start( button ) {
	if ( busy ) {
		return;
	}
	busy = true;

	const url = button.getAttribute( 'data-cpdf-url' );
	const label = button.textContent;
	const iframe = document.createElement( 'iframe' );
	let timer;

	button.setAttribute( 'aria-busy', 'true' );
	button.textContent = strings.working || label;

	function finish() {
		busy = false;
		clearTimeout( timer );
		window.removeEventListener( 'message', onMessage );
		iframe.remove();
		button.removeAttribute( 'aria-busy' );
		setTimeout( () => {
			button.textContent = label;
		}, 2500 );
	}

	function fail() {
		button.textContent = strings.failed || label;
		finish();
		window.open( printUrl( url ), '_blank' );
	}

	function onMessage( event ) {
		if (
			event.origin !== window.location.origin ||
			event.source !== iframe.contentWindow
		) {
			return;
		}
		const data = event.data || {};
		if ( data.type !== 'cpdf' ) {
			return;
		}
		if ( data.status === 'progress' ) {
			// Still alive: push the watchdog back.
			clearTimeout( timer );
			timer = setTimeout( fail, TIMEOUT_MS );
			if ( data.text ) {
				button.textContent = data.text;
			}
		} else if ( data.status === 'done' && data.blob ) {
			download( data.blob, data.filename );
			button.textContent = strings.done || label;
			finish();
		} else if ( data.status === 'error' ) {
			fail();
		}
	}

	window.addEventListener( 'message', onMessage );

	iframe.setAttribute( 'aria-hidden', 'true' );
	iframe.setAttribute( 'tabindex', '-1' );
	iframe.title = 'PDF export';
	iframe.style.cssText =
		'position:fixed;left:-10000px;top:0;width:1000px;height:1400px;border:0;visibility:hidden;pointer-events:none';
	iframe.src = url;
	// A 404 (e.g. logged out on a draft) or a broken page never posts back.
	iframe.addEventListener( 'load', () => {
		try {
			if ( ! iframe.contentWindow.cpdfConfig ) {
				fail();
			}
		} catch ( e ) {
			fail();
		}
	} );
	timer = setTimeout( fail, TIMEOUT_MS );
	document.body.appendChild( iframe );
}

document.addEventListener( 'click', ( event ) => {
	const button = event.target.closest && event.target.closest( '.cpdf-button' );
	if ( button ) {
		event.preventDefault();
		start( button );
	}
} );
