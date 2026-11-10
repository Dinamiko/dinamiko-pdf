const fs = require( 'fs' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const BLOCK_CONTENT = `
<!-- wp:heading -->
<h2 class="wp-block-heading">Section heading</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>First paragraph with <strong>bold</strong> and <code>code</code> text.</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li>List item one</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>List item two</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

<!-- wp:columns -->
<div class="wp-block-columns"><!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph -->
<p>Left column</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph -->
<p>Right column</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column --></div>
<!-- /wp:columns -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><!-- wp:paragraph -->
<p>A quote</p>
<!-- /wp:paragraph --></blockquote>
<!-- /wp:quote -->

<!-- wp:table -->
<figure class="wp-block-table"><table><tbody><tr><td>Cell A</td><td>Cell B</td></tr></tbody></table></figure>
<!-- /wp:table -->
`;

const PAGE_BREAK_CONTENT = `
<!-- wp:paragraph {"className":"has-drop-cap"} -->
<p class="has-drop-cap">Drop cap paragraph on the first page.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"className":"cpdf-page-break"} -->
<h2 class="wp-block-heading cpdf-page-break">Second page</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Text on the second page.</p>
<!-- /wp:paragraph -->
`;

function printUrl( link ) {
	const url = new URL( link );
	url.searchParams.set( 'cpdf_print', '1' );
	return url.href;
}

async function expectPdfDownload( download, filename ) {
	expect( download.suggestedFilename() ).toBe( filename );
	const bytes = fs.readFileSync( await download.path() );
	expect( bytes.subarray( 0, 5 ).toString() ).toBe( '%PDF-' );
	return bytes;
}

function pageCount( bytes ) {
	const match = bytes.toString( 'latin1' ).match( /\/Count (\d+)/ );
	return match ? Number( match[ 1 ] ) : 0;
}

test.describe( 'PDF export', () => {
	let post;
	let page;
	let breakPost;

	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.activateTheme( 'twentytwentyfive' );
		await requestUtils.deleteAllPosts();
		await requestUtils.deleteAllPages();
		post = await requestUtils.createPost( {
			title: 'Blocks Export',
			content: BLOCK_CONTENT,
			status: 'publish',
		} );
		page = await requestUtils.createPage( {
			title: 'Shortcode Page',
			content: '<!-- wp:shortcode -->[content_pdf_button label="Get PDF"]<!-- /wp:shortcode -->',
			status: 'publish',
		} );
		breakPost = await requestUtils.createPost( {
			title: 'Page "break" test',
			content: PAGE_BREAK_CONTENT,
			status: 'publish',
		} );
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.activateTheme( 'twentytwentyfive' );
		await requestUtils.deleteAllPosts();
		await requestUtils.deleteAllPages();
	} );

	test( 'appends the button to posts', async ( { page: browserPage } ) => {
		await browserPage.goto( post.link );
		await expect(
			browserPage.getByRole( 'button', { name: 'Download PDF' } )
		).toBeVisible();
	} );

	test( 'renders the shortcode button on a page', async ( {
		page: browserPage,
	} ) => {
		await browserPage.goto( page.link );
		await expect(
			browserPage.getByRole( 'button', { name: 'Get PDF' } )
		).toBeVisible();
		// Pages are not in the default post types, so there is no automatic button.
		await expect( browserPage.locator( '.cpdf-button' ) ).toHaveCount( 1 );
	} );

	test( 'print page shows only the content (block theme)', async ( {
		page: browserPage,
	} ) => {
		// Keep the export from starting: block the exporter script.
		await browserPage.route( '**/modules/Export/build/index.js*', ( route ) =>
			route.abort()
		);
		await browserPage.goto( printUrl( post.link ) );

		const article = browserPage.locator( '.cpdf-article' );
		await expect( article ).toHaveCount( 1 );
		await expect( article.locator( '.wp-block-post-title' ) ).toHaveText(
			'Blocks Export'
		);
		await expect( article ).toContainText( 'Section heading' );
		await expect( article.locator( '.wp-block-columns' ) ).toHaveCount( 1 );
		await expect( article.locator( 'table' ) ).toContainText( 'Cell B' );
		await expect( browserPage.locator( '.cpdf-button' ) ).toBeHidden();
		await expect( browserPage.locator( 'header.wp-block-template-part' ) ).toHaveCount( 0 );
		await expect( browserPage.locator( 'footer.wp-block-template-part' ) ).toHaveCount( 0 );

		const config = await browserPage.evaluate( () => window.cpdfConfig );
		expect( config.filename ).toBe( 'Blocks-Export.pdf' );
		expect( config.format ).toBe( 'a4' );
	} );

	test( 'visiting the print page downloads the PDF', async ( {
		page: browserPage,
	} ) => {
		const downloadPromise = browserPage.waitForEvent( 'download' );
		await browserPage.goto( printUrl( post.link ) );
		await expectPdfDownload( await downloadPromise, 'Blocks-Export.pdf' );
	} );

	test( 'clicking the button downloads the PDF', async ( {
		page: browserPage,
	} ) => {
		await browserPage.goto( post.link );
		const downloadPromise = browserPage.waitForEvent( 'download' );
		await browserPage
			.getByRole( 'button', { name: 'Download PDF' } )
			.click();
		await expectPdfDownload( await downloadPromise, 'Blocks-Export.pdf' );
	} );

	test( 'a heading page break starts one new page', async ( {
		page: browserPage,
	} ) => {
		const downloadPromise = browserPage.waitForEvent( 'download' );
		await browserPage.goto( printUrl( breakPost.link ) );
		// The title's quotes are texturized to entities; the filename must not contain them.
		const bytes = await expectPdfDownload(
			await downloadPromise,
			'Page-break-test.pdf'
		);
		expect( pageCount( bytes ) ).toBe( 2 );

		// The drop cap's ::first-letter is replaced with a real element for the exporter.
		await expect( browserPage.locator( '.cpdf-drop-cap' ) ).toHaveText(
			'D'
		);
		await expect( browserPage.locator( '.has-drop-cap' ) ).toHaveCount( 0 );
	} );

	test( 'classic theme uses the classic wrappers and exports', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		await requestUtils.activateTheme( 'twentytwentyone' );

		await browserPage.route( '**/modules/Export/build/index.js*', ( route ) =>
			route.abort()
		);
		await browserPage.goto( printUrl( post.link ) );
		const article = browserPage.locator( '.cpdf-article' );
		await expect( article.locator( '.entry-title' ) ).toHaveText(
			'Blocks Export'
		);
		await expect( article.locator( '.entry-content' ) ).toContainText(
			'Section heading'
		);
		await expect( browserPage.locator( '#masthead' ) ).toHaveCount( 0 );
		await browserPage.unroute( '**/modules/Export/build/index.js*' );

		const downloadPromise = browserPage.waitForEvent( 'download' );
		await browserPage.goto( printUrl( post.link ) );
		await expectPdfDownload( await downloadPromise, 'Blocks-Export.pdf' );
	} );
} );
