// Builds the wordpress.org release zip: dist/content-pdf.zip.
// Only tracked files from the allowlist below are copied, so tests, tooling and
// untracked junk never ship. Composer runs with --no-dev in the staging folder,
// which leaves the repo's dev vendor/ untouched. Run through `npm run dist`,
// which builds the JS first.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLUG = 'content-pdf';
const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const distDir = join( root, 'dist' );
const stage = join( distDir, SLUG );
const zipPath = join( distDir, `${ SLUG }.zip` );

// Paths (files or directory prefixes ending in "/") that go into the zip.
// modules/ keeps resources/js on purpose: wordpress.org requires human-readable
// source next to the minified build/. bin/demo-content/ is needed by the Live
// Preview blueprint, which seeds from the installed plugin.
const INCLUDE = [ `${ SLUG }.php`, 'readme.txt', 'modules/', 'bin/demo-content/' ];
// Copied to install production dependencies. composer.json stays in the zip (wordpress.org
// reviewers and Plugin Check expect it next to vendor/); the lock file is removed afterwards.
const COMPOSER_FILES = [ 'composer.json', 'composer.lock' ];
const COMPOSER_REMOVE = [ 'composer.lock' ];

const fail = ( message ) => {
	console.error( `dist: ${ message }` );
	process.exit( 1 );
};

const run = ( cmd, args, cwd ) =>
	execFileSync( cmd, args, { cwd, encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'inherit' ] } );

// Version check: the plugin header and the readme Stable tag must match.
const header = readFileSync( join( root, `${ SLUG }.php` ), 'utf8' ).match( /^\s*\*\s*Version:\s*(\S+)/m );
const stable = readFileSync( join( root, 'readme.txt' ), 'utf8' ).match( /^Stable tag:\s*(\S+)/m );
if ( ! header || ! stable ) {
	fail( 'could not read "Version:" from the plugin header or "Stable tag:" from readme.txt.' );
}
if ( header[ 1 ] !== stable[ 1 ] ) {
	fail( `version mismatch: ${ SLUG }.php has ${ header[ 1 ] }, readme.txt Stable tag is ${ stable[ 1 ] }.` );
}
const version = header[ 1 ];

rmSync( distDir, { recursive: true, force: true } );
mkdirSync( stage, { recursive: true } );

const tracked = run( 'git', [ 'ls-files', '-z' ], root ).split( '\0' ).filter( Boolean );
const files = tracked.filter(
	( file ) =>
		COMPOSER_FILES.includes( file ) ||
		INCLUDE.some( ( entry ) => ( entry.endsWith( '/' ) ? file.startsWith( entry ) : file === entry ) )
);

for ( const file of files ) {
	const target = join( stage, file );
	mkdirSync( dirname( target ), { recursive: true } );
	copyFileSync( join( root, file ), target );
}

run(
	'composer',
	[ 'install', '--no-dev', '--optimize-autoloader', '--no-interaction', '--no-progress', '--quiet' ],
	stage
);
for ( const file of COMPOSER_REMOVE ) {
	rmSync( join( stage, file ), { force: true } );
}

run( 'zip', [ '-rq', `${ SLUG }.zip`, SLUG, '-x', '*.DS_Store' ], distDir );

const count = run( 'zipinfo', [ '-1', zipPath ] ).split( '\n' ).filter( ( line ) => line && ! line.endsWith( '/' ) ).length;
const size = ( statSync( zipPath ).size / 1024 ).toFixed( 1 );
console.log( `Built ${ SLUG } ${ version }: dist/${ SLUG }.zip (${ count } files, ${ size } KB)` );
