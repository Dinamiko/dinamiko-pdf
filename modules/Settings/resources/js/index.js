/**
 * Content PDF settings page: header logo media picker and color picker.
 */
const l10n = window.cpdfSettings || {};

function initLogoField( field ) {
	const input = field.querySelector( '.cpdf-logo-id' );
	const preview = field.querySelector( '.cpdf-logo-preview' );
	const select = field.querySelector( '.cpdf-logo-select' );
	const remove = field.querySelector( '.cpdf-logo-remove' );
	let frame;

	select.addEventListener( 'click', () => {
		if ( ! frame ) {
			frame = window.wp.media( {
				title: l10n.frameTitle,
				button: { text: l10n.frameButton },
				library: { type: [ 'image/png', 'image/jpeg' ] },
				multiple: false,
			} );
			frame.on( 'select', () => {
				const attachment = frame
					.state()
					.get( 'selection' )
					.first()
					.toJSON();
				const size =
					( attachment.sizes && attachment.sizes.medium ) ||
					attachment;
				const img = document.createElement( 'img' );
				img.src = size.url;
				img.alt = '';
				img.style.cssText = 'max-height:60px;width:auto;display:block';
				preview.replaceChildren( img );
				input.value = String( attachment.id );
				remove.hidden = false;
			} );
		}
		frame.open();
	} );

	remove.addEventListener( 'click', () => {
		input.value = '0';
		preview.replaceChildren();
		remove.hidden = true;
	} );
}

function init() {
	document.querySelectorAll( '.cpdf-logo-field' ).forEach( initLogoField );
	if ( window.jQuery && window.jQuery.fn.wpColorPicker ) {
		window.jQuery( '.cpdf-color' ).wpColorPicker();
	}
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', init );
} else {
	init();
}
