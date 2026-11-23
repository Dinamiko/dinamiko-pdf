const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const OPTION = 'dinamiko_pdf_settings';

test.describe( 'Settings page', () => {
	let original;

	test.beforeAll( async ( { requestUtils } ) => {
		const settings = await requestUtils.rest( { path: '/wp/v2/settings' } );
		original = settings[ OPTION ];
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.rest( {
			path: '/wp/v2/settings',
			method: 'POST',
			data: { [ OPTION ]: original },
		} );
	} );

	test( 'saves the settings through the REST API', async ( {
		admin,
		page,
	} ) => {
		await admin.visitAdminPage( 'options-general.php', 'page=dinamiko-pdf' );

		const save = page.getByRole( 'button', { name: 'Save Changes' } );
		await expect( save ).toBeDisabled();

		await page
			.getByRole( 'combobox', { name: /Paper size/ } )
			.selectOption( 'letter' );
		await page
			.getByRole( 'spinbutton', { name: /Page margins/ } )
			.fill( '22' );
		await page
			.getByRole( 'textbox', { name: 'Footer center' } )
			.fill( 'E2E footer' );
		await page
			.getByRole( 'checkbox', { name: /Hide the header and footer/ } )
			.check();
		await page
			.getByRole( 'checkbox', { name: 'Show the post title' } )
			.uncheck();
		await page
			.getByRole( 'checkbox', { name: 'Show the featured image' } )
			.check();
		await expect(
			page.getByRole( 'combobox', { name: /PDF font/ } )
		).toHaveValue( 'noto-sans' );
		await page
			.getByRole( 'combobox', { name: /Heading font/ } )
			.selectOption( 'noto-sans' );

		await expect( save ).toBeEnabled();
		await save.click();
		await expect(
			page.getByText( 'Settings saved.' ).first()
		).toBeVisible();
		await expect( save ).toBeDisabled();

		await page.reload();
		await expect(
			page.getByRole( 'combobox', { name: /Paper size/ } )
		).toHaveValue( 'letter' );
		await expect(
			page.getByRole( 'spinbutton', { name: /Page margins/ } )
		).toHaveValue( '22' );
		await expect(
			page.getByRole( 'textbox', { name: 'Footer center' } )
		).toHaveValue( 'E2E footer' );
		await expect(
			page.getByRole( 'checkbox', { name: /Hide the header and footer/ } )
		).toBeChecked();
		await expect(
			page.getByRole( 'checkbox', { name: 'Show the post title' } )
		).not.toBeChecked();
		await expect(
			page.getByRole( 'checkbox', { name: 'Show the featured image' } )
		).toBeChecked();
		await expect(
			page.getByRole( 'combobox', { name: /Heading font/ } )
		).toHaveValue( 'noto-sans' );
	} );

	test( 'rejects out-of-range values over REST', async ( {
		requestUtils,
	} ) => {
		// requestUtils.rest() throws the error body on a non-2xx response.
		const error = await requestUtils
			.rest( {
				path: '/wp/v2/settings',
				method: 'POST',
				data: { [ OPTION ]: { ...original, margin_mm: 99 } },
			} )
			.catch( ( body ) => body );

		expect( error.code ).toBe( 'rest_invalid_param' );
	} );
} );
