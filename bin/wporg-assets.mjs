/**
 * Generates the wordpress.org plugin page assets into .wordpress-org/ (SVN `assets/`).
 *
 *   node bin/wporg-assets.mjs --brand        # icon PNGs from icon.svg, banners from bin/wporg-assets/banner.html
 *   node bin/wporg-assets.mjs --screenshots  # screenshot-1..6.png from the wp-env dev site
 *
 * --screenshots needs wp-env running and `pdftoppm` (poppler) on the host. It reseeds the demo
 * (block theme, then classic for screenshot 6) and leaves the block demo seeded at the end.
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
const width = 1600;
const height = 1000;

const args = process.argv.slice( 2 );
if ( ! args.includes( '--brand' ) && ! args.includes( '--screenshots' ) ) {
	console.error( 'Usage: node bin/wporg-assets.mjs --brand | --screenshots' );
	process.exit( 1 );
}

const browser = await chromium.launch();
try {
	if ( args.includes( '--brand' ) ) {
		await brand();
	}
	if ( args.includes( '--screenshots' ) ) {
		await screenshots();
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
 * Screenshots 1-6, matching `== Screenshots ==` in readme.txt.
 */
async function screenshots() {
	execSync( 'which pdftoppm', { stdio: 'ignore' } );

	seed( 'demo:seed' );
	const visitor = await browser.newContext( { viewport: { width, height } } );
	const page = await visitor.newPage();

	// 1. The button on a post.
	await page.goto( await demoLink( page, 'Core text blocks' ) );
	let button = page.locator( '.cpdf-button' ).first();
	await button.evaluate( ( el ) => {
		el.scrollIntoView( { block: 'end' } );
		window.scrollBy( 0, 120 );
	} );
	await button.hover();
	await save( page, 'screenshot-1.png' );

	// 2. The PDF of a media-heavy post.
	await page.goto( await demoLink( page, 'Media and layout blocks' ) );
	button = page.locator( '.cpdf-button' ).first();
	await spread( page, await downloadPdf( page, button ), 'screenshot-2.png' );
	await visitor.close();

	// 3-5. Settings cards.
	const admin = await browser.newContext( { viewport: { width, height: 1200 } } );
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
		const card = adminPage.locator( '.dataforms-layouts-card__field' ).filter( { hasText: text } ).last();
		await card.waitFor();
		await card.screenshot( { path: path.join( out, file ) } );
		console.log( `Wrote .wordpress-org/${ file }` );
	}
	await admin.close();

	// 6. The same post exported from a classic theme.
	seed( 'demo:seed:classic' );
	const classic = await browser.newContext( { viewport: { width, height } } );
	const classicPage = await classic.newPage();
	await classicPage.goto( await demoLink( classicPage, 'Media and layout blocks' ) );
	const pdf = await downloadPdf( classicPage, classicPage.locator( '.cpdf-button' ).first() );
	await spread( classicPage, pdf, 'screenshot-6.png' );
	await classic.close();

	seed( 'demo:seed' );
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
 * @return {Promise<string>} PDF file path.
 */
async function downloadPdf( page, button ) {
	const [ download ] = await Promise.all( [
		page.waitForEvent( 'download', { timeout: 120000 } ),
		button.click(),
	] );
	const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'cpdf-' ) ), 'out.pdf' );
	await download.saveAs( file );
	return file;
}

/**
 * Renders the first two PDF pages side by side and saves the screenshot.
 *
 * @param {import('playwright').Page} page Page.
 * @param {string}                    pdf  PDF path.
 * @param {string}                    file Output name.
 */
async function spread( page, pdf, file ) {
	const prefix = path.join( path.dirname( pdf ), 'page' );
	execSync( `pdftoppm -png -r 110 -f 1 -l 2 "${ pdf }" "${ prefix }"` );
	const images = fs
		.readdirSync( path.dirname( pdf ) )
		.filter( ( name ) => name.startsWith( 'page' ) && name.endsWith( '.png' ) )
		.sort()
		.map( ( name ) => fs.readFileSync( path.join( path.dirname( pdf ), name ) ).toString( 'base64' ) );
	await page.setViewportSize( { width, height } );
	await page.setContent( `
		<style>
			html,body{margin:0;height:100%}
			body{background:#e5e7eb;display:flex;gap:48px;justify-content:center;align-items:center}
			img{height:${ height - 96 }px;box-shadow:0 10px 30px rgba(0,0,0,.18);background:#fff}
		</style>
		${ images.map( ( src ) => `<img src="data:image/png;base64,${ src }">` ).join( '' ) }
	` );
	await save( page, file );
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
