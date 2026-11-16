const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
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
			content:
				'<!-- wp:shortcode -->[content_pdf_button label="Get PDF"]<!-- /wp:shortcode -->',
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
		await expect(
			browserPage.locator( '.wp-block-post-content > :last-child' )
		).toHaveClass( /cpdf-button-wrap/ );
	} );

	test( 'the position setting puts the button before the content', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		const { cpdf_settings: original } = await requestUtils.rest( {
			path: '/wp/v2/settings',
		} );
		await requestUtils.rest( {
			path: '/wp/v2/settings',
			method: 'POST',
			data: { cpdf_settings: { ...original, button_position: 'before' } },
		} );
		try {
			await browserPage.goto( post.link );
			await expect(
				browserPage.locator( '.wp-block-post-content > :first-child' )
			).toHaveClass( /cpdf-button-wrap/ );
		} finally {
			await requestUtils.rest( {
				path: '/wp/v2/settings',
				method: 'POST',
				data: { cpdf_settings: original },
			} );
		}
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

	test( 'renders the PDF Button block instead of the automatic button', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		const blockPost = await requestUtils.createPost( {
			title: 'Block Button Post',
			content:
				'<!-- wp:paragraph --><p>Intro.</p><!-- /wp:paragraph -->' +
				'<!-- wp:content-pdf/button {"label":"Save \\u0026amp; share","action":"view"} /-->',
			status: 'publish',
		} );
		await browserPage.goto( blockPost.link );
		const button = browserPage.getByRole( 'button', {
			name: 'Save & share',
		} );
		await expect( button ).toBeVisible();
		await expect( button ).toHaveAttribute( 'data-cpdf-action', 'view' );
		// Posts get the automatic button, but not when the content has the block.
		await expect( browserPage.locator( '.cpdf-button' ) ).toHaveCount( 1 );

		// The block is not printed in the PDF.
		await browserPage.route(
			'**/modules/Export/build/index.js*',
			( route ) => route.abort()
		);
		await browserPage.goto( printUrl( blockPost.link ) );
		await expect( browserPage.locator( '.cpdf-article' ) ).toContainText(
			'Intro.'
		);
		await expect( browserPage.locator( '.cpdf-button' ) ).toHaveCount( 0 );
	} );

	test( 'the PDF Button block exports another post by ID', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		const blockPage = await requestUtils.createPage( {
			title: 'Block Page',
			content: `<!-- wp:content-pdf/button {"postId":${ post.id }} /-->`,
			status: 'publish',
		} );
		await browserPage.goto( blockPage.link );
		const downloadPromise = browserPage.waitForEvent( 'download' );
		await browserPage
			.getByRole( 'button', { name: 'Download PDF' } )
			.click();
		await expectPdfDownload( await downloadPromise, 'Blocks-Export.pdf' );
	} );

	test( 'the PDF Button block can be added in the editor', async ( {
		admin,
		editor,
	} ) => {
		await admin.createNewPost();
		await editor.insertBlock( { name: 'content-pdf/button' } );
		const block = editor.canvas.locator(
			'[data-type="content-pdf/button"]'
		);
		await expect( block ).toBeVisible();
		await expect(
			block.getByRole( 'textbox', { name: 'Button text' } )
		).toBeVisible();
		await editor.openDocumentSettingsSidebar();
		await expect(
			admin.page.getByRole( 'combobox', { name: 'Button action' } )
		).toBeVisible();
	} );

	test( 'print page shows only the content (block theme)', async ( {
		page: browserPage,
	} ) => {
		// Keep the export from starting: block the exporter script.
		await browserPage.route(
			'**/modules/Export/build/index.js*',
			( route ) => route.abort()
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
		await expect(
			browserPage.locator( 'header.wp-block-template-part' )
		).toHaveCount( 0 );
		await expect(
			browserPage.locator( 'footer.wp-block-template-part' )
		).toHaveCount( 0 );

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

	test( 'view mode shows the PDF in the tab instead of downloading', async ( {
		page: browserPage,
	} ) => {
		await browserPage.goto( printUrl( post.link ) + '&cpdf_mode=view' );

		const viewer = browserPage.locator( 'iframe.cpdf-viewer' );
		await expect( viewer ).toHaveAttribute( 'src', /^blob:/, {
			timeout: 60000,
		} );
		const link = browserPage.locator( '.cpdf-viewer-toolbar a' );
		await expect( link ).toHaveAttribute( 'download', 'Blocks-Export.pdf' );
		// The page hands the PDF to the viewer instead of downloading it. (Headless Chromium has no
		// PDF viewer and saves the iframe's PDF as a download, so downloads are not asserted.)
		await expect( browserPage.locator( '.cpdf-article' ) ).toBeHidden();

		// The toolbar link downloads the same PDF with the real filename.
		const downloadPromise = browserPage.waitForEvent( 'download' );
		await link.click();
		await expectPdfDownload( await downloadPromise, 'Blocks-Export.pdf' );
	} );

	test( 'a view button opens the PDF in a new tab', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		const viewPage = await requestUtils.createPage( {
			title: 'View Page',
			content: `<!-- wp:shortcode -->[content_pdf_button id="${ post.id }" action="view"]<!-- /wp:shortcode -->`,
			status: 'publish',
		} );
		await browserPage.goto( viewPage.link );

		const popupPromise = browserPage.waitForEvent( 'popup' );
		await browserPage.getByRole( 'button', { name: 'View PDF' } ).click();
		const popup = await popupPromise;
		expect( popup.url() ).toContain( 'cpdf_mode=view' );
		await expect( popup.locator( 'iframe.cpdf-viewer' ) ).toHaveAttribute(
			'src',
			/^blob:/,
			{ timeout: 60000 }
		);
		await popup.close();
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

	test( 'settings hide the title and show the featured image', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		const { cpdf_settings: original } = await requestUtils.rest( {
			path: '/wp/v2/settings',
		} );
		const setSettings = ( values ) =>
			requestUtils.rest( {
				path: '/wp/v2/settings',
				method: 'POST',
				data: { cpdf_settings: { ...original, ...values } },
			} );

		// 40×20 red PNG.
		const imagePath = path.join( os.tmpdir(), 'cpdf-featured.png' );
		fs.writeFileSync(
			imagePath,
			Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAJElEQVR42mM4o6Q0IIhh1OJRi0ctHrV41OJRi0ctHrV45FgMAJxAUi7Hems4AAAAAElFTkSuQmCC',
				'base64'
			)
		);
		const media = await requestUtils.uploadMedia( imagePath );
		const featuredPost = await requestUtils.createPost( {
			title: 'Featured Export',
			content: BLOCK_CONTENT,
			status: 'publish',
			featured_media: media.id,
		} );

		try {
			await browserPage.route(
				'**/modules/Export/build/index.js*',
				( route ) => route.abort()
			);
			const article = browserPage.locator( '.cpdf-article' );

			// Defaults: title on, featured image off.
			await browserPage.goto( printUrl( featuredPost.link ) );
			await expect(
				article.locator( '.wp-block-post-title' )
			).toHaveText( 'Featured Export' );
			await expect(
				article.locator( '.cpdf-featured-image' )
			).toHaveCount( 0 );

			await setSettings( {
				show_title: false,
				show_featured_image: true,
			} );
			await browserPage.goto( printUrl( featuredPost.link ) );
			await expect(
				article.locator( '.wp-block-post-title' )
			).toHaveCount( 0 );
			await expect(
				article.locator( '.cpdf-featured-image img' )
			).toBeVisible();
			await browserPage.unroute( '**/modules/Export/build/index.js*' );

			const downloadPromise = browserPage.waitForEvent( 'download' );
			await browserPage.goto( printUrl( featuredPost.link ) );
			await expectPdfDownload(
				await downloadPromise,
				'Featured-Export.pdf'
			);
		} finally {
			await setSettings( {} );
			await requestUtils.deleteMedia( media.id );
		}
	} );

	test( 'classic theme uses the classic wrappers and exports', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		await requestUtils.activateTheme( 'twentytwentyone' );

		await browserPage.route(
			'**/modules/Export/build/index.js*',
			( route ) => route.abort()
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

	test( 'theme templates follow the print template hierarchy', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		// Block child theme with content-pdf/print-page.php and print-post-cpdf-hierarchy-post.php.
		await requestUtils.activateTheme( 'cpdf-test-child' );
		const slugPost = await requestUtils.createPost( {
			title: 'Hierarchy Post',
			slug: 'cpdf-hierarchy-post',
			content: BLOCK_CONTENT,
			status: 'publish',
		} );

		await browserPage.route(
			'**/modules/Export/build/index.js*',
			( route ) => route.abort()
		);
		const marker = browserPage.locator(
			'.cpdf-article .cpdf-test-template'
		);

		// print-page.php matches every page.
		await browserPage.goto( printUrl( page.link ) );
		await expect( marker ).toHaveText( 'print-page.php' );

		// print-post-{slug}.php matches only that post.
		await browserPage.goto( printUrl( slugPost.link ) );
		await expect( marker ).toHaveText(
			'print-post-cpdf-hierarchy-post.php'
		);

		// Other posts fall back to the plugin template.
		await browserPage.goto( printUrl( post.link ) );
		await expect( marker ).toHaveCount( 0 );
		await expect(
			browserPage.locator( '.cpdf-article .wp-block-post-title' )
		).toHaveText( 'Blocks Export' );
		await browserPage.unroute( '**/modules/Export/build/index.js*' );

		// A custom template still exports.
		const downloadPromise = browserPage.waitForEvent( 'download' );
		await browserPage.goto( printUrl( page.link ) );
		await expectPdfDownload( await downloadPromise, 'Shortcode-Page.pdf' );
	} );

	test( 'fonts from cpdf_fonts apply to headings and body text', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		// The child theme registers "cpdf-test-font" (the Noto Sans Bold file) through cpdf_fonts.
		await requestUtils.activateTheme( 'cpdf-test-child' );
		const { cpdf_settings: original } = await requestUtils.rest( {
			path: '/wp/v2/settings',
		} );
		await requestUtils.rest( {
			path: '/wp/v2/settings',
			method: 'POST',
			data: {
				cpdf_settings: { ...original, font_heading: 'cpdf-test-font' },
			},
		} );

		try {
			await browserPage.route(
				'**/modules/Export/build/index.js*',
				( route ) => route.abort()
			);
			await browserPage.goto( printUrl( post.link ) );

			const config = await browserPage.evaluate(
				() => window.cpdfConfig
			);
			const heading = config.fonts.filter(
				( font ) => font.family === 'cpdf-heading'
			);
			expect( heading ).toHaveLength( 1 );
			expect( heading[ 0 ].url ).toContain( 'NotoSans-Bold.ttf' );
			expect( heading[ 0 ].weight ).toBe( 400 );
			expect(
				config.fonts.filter( ( font ) => font.family === 'cpdf-body' )
			).toHaveLength( 2 );
			expect( config.regions.fontFamily ).toBe( 'cpdf-body' );

			const fontFamily = ( locator ) =>
				locator.evaluate(
					( el ) =>
						el.ownerDocument.defaultView.getComputedStyle( el )
							.fontFamily
				);
			const article = browserPage.locator( '.cpdf-article' );
			expect(
				await fontFamily( article.locator( 'h2' ).first() )
			).toMatch( /^"?cpdf-heading"?/ );
			expect(
				await fontFamily( article.locator( '.wp-block-post-title' ) )
			).toMatch( /^"?cpdf-heading"?/ );
			expect(
				await fontFamily( article.locator( 'p' ).first() )
			).toMatch( /^"?cpdf-body"?/ );
			await browserPage.unroute( '**/modules/Export/build/index.js*' );

			const downloadPromise = browserPage.waitForEvent( 'download' );
			await browserPage.goto( printUrl( post.link ) );
			await expectPdfDownload(
				await downloadPromise,
				'Blocks-Export.pdf'
			);
		} finally {
			await requestUtils.rest( {
				path: '/wp/v2/settings',
				method: 'POST',
				data: { cpdf_settings: original },
			} );
			await requestUtils.activateTheme( 'twentytwentyfive' );
		}
	} );

	test( 'Font Library families with TTF files can be selected', async ( {
		admin,
		page: browserPage,
		requestUtils,
	} ) => {
		const ttf = new URL(
			'/wp-content/plugins/content-pdf/modules/Export/assets/fonts/NotoSans-Bold.ttf',
			post.link
		).href;
		const family = await requestUtils.rest( {
			path: '/wp/v2/font-families',
			method: 'POST',
			params: {
				font_family_settings: JSON.stringify( {
					name: 'E2E Library Font',
					slug: 'e2e-library-font',
					fontFamily: '"E2E Library Font", sans-serif',
				} ),
			},
		} );
		const { cpdf_settings: original } = await requestUtils.rest( {
			path: '/wp/v2/settings',
		} );

		try {
			await requestUtils.rest( {
				path: `/wp/v2/font-families/${ family.id }/font-faces`,
				method: 'POST',
				params: {
					font_face_settings: JSON.stringify( {
						fontFamily: '"E2E Library Font", sans-serif',
						fontWeight: '400',
						fontStyle: 'normal',
						src: ttf,
					} ),
				},
			} );

			// The settings page offers the family.
			await admin.visitAdminPage(
				'options-general.php',
				'page=content-pdf'
			);
			await browserPage
				.getByRole( 'combobox', { name: /PDF font/ } )
				.selectOption( 'e2e-library-font' );
			await browserPage
				.getByRole( 'button', { name: 'Save Changes' } )
				.click();
			await expect(
				browserPage.getByText( 'Settings saved.' ).first()
			).toBeVisible();

			// The print page embeds its TTF as the body font.
			await browserPage.route(
				'**/modules/Export/build/index.js*',
				( route ) => route.abort()
			);
			await browserPage.goto( printUrl( post.link ) );
			const config = await browserPage.evaluate(
				() => window.cpdfConfig
			);
			expect(
				config.fonts.filter( ( font ) => font.family === 'cpdf-body' )
			).toEqual( [
				{
					family: 'cpdf-body',
					url: ttf,
					weight: 400,
					style: 'normal',
				},
			] );
			await browserPage.unroute( '**/modules/Export/build/index.js*' );

			const downloadPromise = browserPage.waitForEvent( 'download' );
			await browserPage.goto( printUrl( post.link ) );
			await expectPdfDownload(
				await downloadPromise,
				'Blocks-Export.pdf'
			);
		} finally {
			await requestUtils.rest( {
				path: '/wp/v2/settings',
				method: 'POST',
				data: { cpdf_settings: original },
			} );
			await requestUtils.rest( {
				path: `/wp/v2/font-families/${ family.id }`,
				method: 'DELETE',
				params: { force: true },
			} );
		}
	} );

	test( 'password-protected posts need the password first', async ( {
		page: browserPage,
		requestUtils,
	} ) => {
		const secret = 'Protected secret paragraph';
		const protectedPost = await requestUtils.createPost( {
			title: 'Protected Export',
			content: `<!-- wp:paragraph --><p>${ secret }</p><!-- /wp:paragraph -->`,
			status: 'publish',
			password: 'cpdf',
		} );

		// Without the password: no button, and the print URL shows the password form, not the content.
		await browserPage.goto( protectedPost.link );
		await expect( browserPage.locator( '.cpdf-button' ) ).toHaveCount( 0 );
		await browserPage.goto( printUrl( protectedPost.link ) );
		await expect( browserPage.locator( '.cpdf-article' ) ).toHaveCount( 0 );
		await expect(
			browserPage.locator( 'input[name="post_password"]' )
		).toBeVisible();
		expect( await browserPage.content() ).not.toContain( secret );

		// After entering it: the button appears and the post exports.
		await browserPage.goto( protectedPost.link );
		await browserPage
			.locator( 'input[name="post_password"]' )
			.fill( 'cpdf' );
		await browserPage
			.locator( 'input[name="post_password"]' )
			.press( 'Enter' );
		await expect(
			browserPage.getByRole( 'button', { name: 'Download PDF' } )
		).toBeVisible();
		const downloadPromise = browserPage.waitForEvent( 'download' );
		await browserPage.goto( printUrl( protectedPost.link ) );
		await expectPdfDownload(
			await downloadPromise,
			// WordPress prefixes protected titles (protected_title_format).
			'Protected-Protected-Export.pdf'
		);
	} );
} );
