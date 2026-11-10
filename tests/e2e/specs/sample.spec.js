const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

test.describe( 'Sample module', () => {
	test( 'shows the admin notice on the dashboard', async ( { admin, page } ) => {
		await admin.visitAdminPage( '/' );

		// The notice is echoed as a bare text node (no wrapper element),
		// so assert on the admin content area that contains it.
		await expect( page.locator( '#wpbody-content' ) ).toContainText(
			'Sample message here.'
		);
	} );

	test( 'logs the sample message to the browser console', async ( {
		admin,
		page,
	} ) => {
		const messages = [];
		page.on( 'console', ( message ) => messages.push( message.text() ) );

		await admin.visitAdminPage( '/' );

		await expect
			.poll( () => messages )
			.toContain( 'JS sample message.' );
	} );
} );
