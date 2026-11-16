/**
 * Generates the wordpress.org plugin page assets into .wordpress-org/ (SVN `assets/`).
 *
 *   node bin/wporg-assets.mjs --brand        # icon PNGs from icon.svg, banners from bin/wporg-assets/banner.html
 *   node bin/wporg-assets.mjs --screenshots  # screenshot-1..5.png from the wp-env dev site
 *   node bin/wporg-assets.mjs --screenshot-1 # only screenshot-1.png, without reseeding (block demo must be seeded)
 *
 * --screenshots needs wp-env running and `pdftoppm` (poppler) on the host. It reseeds the block theme demo first.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const out = path.join( root, '.wordpress-org' );
const base = process.env.WP_BASE_URL || 'http://localhost:8888';

const args = process.argv.slice( 2 );
if ( ! [ '--brand', '--screenshots', '--screenshot-1' ].some( ( arg ) => args.includes( arg ) ) ) {
	console.error( 'Usage: node bin/wporg-assets.mjs --brand | --screenshots | --screenshot-1' );
	process.exit( 1 );
}

const browser = await chromium.launch();
try {
	if ( args.includes( '--brand' ) ) {
		await brand();
	}
	if ( args.includes( '--screenshots' ) ) {
		await screenshots();
	} else if ( args.includes( '--screenshot-1' ) ) {
		await buttonScene();
	}
} finally {
	await browser.close();
}

/**
 * Icon PNGs and banners, at exact sizes.
 */
async function brand() {
	const svg = fs.readFileSync( path.join( out, 'icon.svg' ), 'utf8' );
	for ( const size of [ 128, 256 ] ) {
		const page = await browser.newPage( { viewport: { width: size, height: size } } );
		await page.setContent(
			`<style>html,body{margin:0}svg{display:block;width:${ size }px;height:${ size }px}</style>${ svg }`
		);
		await save( page, `icon-${ size }x${ size }.png`, { omitBackground: true } );
		await page.close();
	}

	// The banner shows the icon without its name (the name is written next to it), with the page centered.
	const mark = svg
		.replace( /<text[\s\S]*?<\/text>/, '' )
		.replace( '<g id="mark">', '<g id="mark" transform="translate(2 24)">' );
	const html = fs
		.readFileSync( path.join( root, 'bin/wporg-assets/banner.html' ), 'utf8' )
		.replace( 'src="ICON"', `src="data:image/svg+xml;base64,${ Buffer.from( mark ).toString( 'base64' ) }"` );
	for ( const scale of [ 1, 0.5 ] ) {
		const page = await browser.newPage( {
			viewport: { width: 1544, height: 500 },
			deviceScaleFactor: scale,
		} );
		await page.setContent( html );
		await save( page, `banner-${ 1544 * scale }x${ 500 * scale }.png` );
		await page.close();
	}
}

/**
 * Screenshots 1-5, matching `== Screenshots ==` in readme.txt.
 */
async function screenshots() {
	execSync( 'which pdftoppm', { stdio: 'ignore' } );

	seed( 'demo:seed' );

	// 1. The button at the end of a post, staged in a browser frame.
	await buttonScene();

	// 2. A block theme page (cover, dark sections and photos from a custom template) and its PDF.
	await webToPdf( 'Event landing (custom template)', 'yoursite.com/events/landing/', 'screenshot-2.png' );

	// 3-5. Settings cards.
	const admin = await browser.newContext( { viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 } );
	const adminPage = await admin.newPage();
	await adminPage.goto( `${ base }/wp-login.php` );
	await adminPage.fill( '#user_login', 'admin' );
	await adminPage.fill( '#user_pass', 'password' );
	await adminPage.click( '#wp-submit' );
	await adminPage.waitForURL( /wp-admin/ );
	await adminPage.goto( `${ base }/wp-admin/options-general.php?page=content-pdf` );
	const cards = [
		[ 'Show button on', 'screenshot-3.png' ],
		[ 'PDF font', 'screenshot-4.png' ],
		[ 'Header logo', 'screenshot-5.png' ],
	];
	for ( const [ text, file ] of cards ) {
		await settingsCard( adminPage, text, file );
	}
	await admin.close();
}

/**
 * Screenshot 1: the end of a demo post in a browser frame, with the "Download PDF" button highlighted,
 * a cursor clicking it and the browser's download notice with the real filename and size.
 * Only the post's "Tables" section is kept, so the view shows a table followed by the button.
 */
async function buttonScene() {
	// A narrower viewport, scaled up to the 1280px frame, makes the post text larger.
	const context = await browser.newContext( { viewport: { width: 1056, height: 590 }, deviceScaleFactor: 2.5 } );
	const page = await context.newPage();
	await page.goto( await demoLink( page, 'Core text blocks' ) );
	const button = page.locator( '.cpdf-button' ).first();
	await button.evaluate( ( el ) => {
		// Keep only the "Tables" section and the button: the post then reads as a table followed by the button.
		const wrap = el.closest( '.cpdf-button-wrap' );
		// The scene shows the button after the content, whatever the "button_position" setting is.
		wrap.parentElement.append( wrap );
		let section = false;
		for ( const child of wrap.parentElement.children ) {
			const text = child.textContent.trim();
			section = ( section || text === 'Tables' ) && text !== 'Buttons, separators and details';
			if ( child !== wrap && ! section ) {
				child.style.display = 'none';
			}
		}
		// Start the view just above the "Tables" heading (extra space below lets the page scroll that far).
		const heading = [ ...wrap.parentElement.children ].find( ( child ) => child.textContent.trim() === 'Tables' );
		document.body.style.paddingBottom = '1000px';
		window.scrollTo( 0, heading.getBoundingClientRect().top + window.scrollY - 36 );
	} );
	const box = await button.boundingBox();
	const image = ( await page.screenshot() ).toString( 'base64' );
	const pdf = await downloadPdf( page, button );
	await context.close();

	const zoom = 1280 / 1056;
	const tokens = {
		IMAGE: `data:image/png;base64,${ image }`,
		BX: Math.round( box.x * zoom ),
		BY: Math.round( box.y * zoom ),
		BW: Math.round( box.width * zoom ),
		BH: Math.round( box.height * zoom ),
		FILENAME: path.basename( pdf ),
		SIZE: `${ Math.max( 1, Math.round( fs.statSync( pdf ).size / 1024 ) ) } KB`,
	};
	const html = fs
		.readFileSync( path.join( root, 'bin/wporg-assets/screenshot-1.html' ), 'utf8' )
		.replace( /\{\{(\w+)\}\}/g, ( match, key ) => String( tokens[ key ] ?? match ) );
	const scene = await browser.newPage( { viewport: { width: 1376, height: 855 } } );
	await scene.setContent( html );
	await save( scene, 'screenshot-1.png' );
	await scene.close();
}

/**
 * Runs a demo seed npm script.
 *
 * @param {string} script npm script name.
 */
function seed( script ) {
	console.log( `Running npm run ${ script }…` );
	execSync( `npm run ${ script }`, { cwd: root, stdio: 'ignore' } );
}

/**
 * URL of a demo item, from the demo front page.
 *
 * @param {import('playwright').Page} page  Page.
 * @param {string}                    title Link text.
 * @return {Promise<string>} URL.
 */
async function demoLink( page, title ) {
	await page.goto( base );
	return page.getByRole( 'link', { name: title, exact: true } ).first().getAttribute( 'href' );
}

/**
 * Clicks a download button and returns the PDF path.
 *
 * @param {import('playwright').Page}    page   Page.
 * @param {import('playwright').Locator} button Button.
 * @return {Promise<string>} PDF file path (named like the download).
 */
async function downloadPdf( page, button ) {
	const [ download ] = await Promise.all( [
		page.waitForEvent( 'download', { timeout: 120000 } ),
		button.click(),
	] );
	const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'cpdf-' ) ), download.suggestedFilename() );
	await download.saveAs( file );
	return file;
}

/**
 * The first pages of a PDF as PNG data URLs.
 *
 * @param {string} pdf   PDF path.
 * @param {number} count Number of pages.
 * @return {string[]} Data URLs.
 */
function pdfPages( pdf, count ) {
	const dir = path.dirname( pdf );
	execSync( `pdftoppm -png -r 150 -f 1 -l ${ count } "${ pdf }" "${ path.join( dir, 'page' ) }"` );
	return fs
		.readdirSync( dir )
		.filter( ( name ) => name.startsWith( 'page' ) && name.endsWith( '.png' ) )
		.sort()
		.map( ( name ) => `data:image/png;base64,${ fs.readFileSync( path.join( dir, name ) ).toString( 'base64' ) }` );
}

/**
 * Screenshot 2: a demo item in a browser frame next to its generated PDF
 * (bin/wporg-assets/web-to-pdf.html), with the real PDF filename and page count.
 *
 * @param {string} title Demo item title (front page link text).
 * @param {string} url   Address shown in the browser frame.
 * @param {string} file  Output name.
 */
async function webToPdf( title, url, file ) {
	const context = await browser.newContext( { viewport: { width: 820, height: 1000 }, deviceScaleFactor: 2 } );
	const page = await context.newPage();
	await page.goto( await demoLink( page, title ) );
	const web = ( await page.screenshot() ).toString( 'base64' );
	const pdf = await downloadPdf( page, page.locator( '.cpdf-button' ).first() );
	await context.close();

	const counts = [ ...fs.readFileSync( pdf, 'latin1' ).matchAll( /\/Count (\d+)/g ) ].map( ( match ) => Number( match[ 1 ] ) );
	const pages = Math.max( 1, ...counts );
	const tokens = {
		WEB: `data:image/png;base64,${ web }`,
		URL: url,
		PDF: pdfPages( pdf, 1 )[ 0 ],
		FILENAME: path.basename( pdf ),
		PAGES: `${ pages } ${ 1 === pages ? 'page' : 'pages' }`,
	};
	const html = fs
		.readFileSync( path.join( root, 'bin/wporg-assets/web-to-pdf.html' ), 'utf8' )
		.replace( /\{\{(\w+)\}\}/g, ( match, key ) => String( tokens[ key ] ?? match ) );
	const shot = await browser.newPage( { viewport: { width: 1370, height: 950 } } );
	await shot.setContent( html );
	await save( shot, file );
	await shot.close();
}

/**
 * Screenshots 3-5: one settings card, with some of the admin page around it, in a browser frame.
 *
 * @param {import('playwright').Page} page Settings page (2x device scale).
 * @param {string}                    text Text that identifies the card.
 * @param {string}                    file Output name.
 */
async function settingsCard( page, text, file ) {
	const card = page.locator( '.dataforms-layouts-card__field' ).filter( { hasText: text } ).last();
	await card.waitFor( { state: 'attached' } );
	await page.addStyleTag( {
		content: '#wpadminbar, #adminmenumain { display: none !important; } html.wp-toolbar { padding-top: 0; } #wpcontent { margin-left: 0; }',
	} );
	// Only this card shows: the other cards and the Save button are hidden (they keep their space).
	await card.evaluate( ( el ) => {
		for ( const other of document.querySelectorAll( '.dataforms-layouts-card__field' ) ) {
			other.style.visibility = el.contains( other ) || other.contains( el ) ? '' : 'hidden';
		}
		for ( const button of document.querySelectorAll( '.wrap button, .wrap .notice' ) ) {
			if ( ! button.closest( '.dataforms-layouts-card__field' ) ) {
				button.style.visibility = 'hidden';
			}
		}
		window.scrollTo( 0, el.getBoundingClientRect().top + window.scrollY - 24 );
	} );
	const box = await card.boundingBox();
	const margin = 24;
	const clip = {
		x: Math.max( 0, box.x - margin ),
		y: Math.max( 0, box.y - margin ),
		width: box.width + margin * 2,
		height: box.height + margin * 2,
	};
	const image = ( await page.screenshot( { clip } ) ).toString( 'base64' );
	const shot = await browser.newPage();
	await scene(
		shot,
		`<div class="browser">
			<div class="bar"><i></i><i></i><i></i><div class="url">yoursite.com/wp-admin/options-general.php?page=content-pdf</div></div>
			<img src="data:image/png;base64,${ image }" width="${ clip.width }" height="${ clip.height }">
		</div>`,
		file
	);
	await shot.close();
}

/**
 * Saves `content` on the blue background shared by all screenshots (see bin/wporg-assets/screenshot-1.html):
 * a 48px border, with `.browser` (frame with a title bar) and `.pdf-page` (PDF page image) styles available.
 *
 * @param {import('playwright').Page} page    Page.
 * @param {string}                    content HTML.
 * @param {string}                    file    Output name.
 */
async function scene( page, content, file ) {
	await page.setViewportSize( { width: 2400, height: 1400 } );
	await page.setContent( `
		<style>
			html, body { margin: 0; }
			body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
			.scene {
				display: inline-flex; gap: 48px; align-items: center; padding: 48px;
				background: linear-gradient(120deg, #1d35b4 0%, #3858e9 55%, #6f86ff 100%);
			}
			.browser { border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 20px 40px rgba(0, 0, 0, .25); }
			.browser img { display: block; }
			.bar { height: 44px; background: #eef0f6; display: flex; align-items: center; gap: 8px; padding: 0 18px; }
			.bar i { width: 12px; height: 12px; border-radius: 50%; }
			.bar i:nth-child(1) { background: #ff5f57; }
			.bar i:nth-child(2) { background: #febc2e; }
			.bar i:nth-child(3) { background: #28c840; }
			.url {
				margin-left: 18px; flex: 1; max-width: 620px; height: 26px; border-radius: 13px; background: #fff;
				color: #5b6275; font-size: 14px; line-height: 26px; padding: 0 14px;
			}
			.pdf-page { display: block; height: 860px; background: #fff; border-radius: 4px; box-shadow: 0 20px 40px rgba(0, 0, 0, .25); }
		</style>
		<div class="scene">${ content }</div>
	` );
	await page.locator( '.scene' ).screenshot( { path: path.join( out, file ) } );
	console.log( `Wrote .wordpress-org/${ file }` );
}

/**
 * Saves a viewport screenshot to .wordpress-org/.
 *
 * @param {import('playwright').Page} page    Page.
 * @param {string}                    file    Output name.
 * @param {Object}                    options Extra screenshot options.
 */
async function save( page, file, options = {} ) {
	await page.screenshot( { path: path.join( out, file ), ...options } );
	console.log( `Wrote .wordpress-org/${ file }` );
}
