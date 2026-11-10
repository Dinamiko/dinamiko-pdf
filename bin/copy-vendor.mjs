// Copies the dompdf.js browser (UMD) build into modules/Export/assets/vendor/dompdf.
// dompdf.js 2.x inlines its WASM (base64) and builds its Web Worker from a Blob,
// so the single UMD file is all the plugin needs at runtime. The copy is committed.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const src = join( root, 'node_modules', 'dompdf.js' );
const dest = join( root, 'modules', 'Export', 'assets', 'vendor', 'dompdf' );

if ( ! existsSync( src ) ) {
	console.error( 'dompdf.js is not installed. Run `npm install` first.' );
	process.exit( 1 );
}

mkdirSync( dest, { recursive: true } );
for ( const [ from, to ] of [
	[ 'dist/dompdf.min.js', 'dompdf.min.js' ],
	[ 'dist/dompdf.js', 'dompdf.js' ],
	[ 'LICENSE', 'LICENSE' ],
] ) {
	copyFileSync( join( src, from ), join( dest, to ) );
}

const { version } = JSON.parse( readFileSync( join( src, 'package.json' ), 'utf8' ) );
writeFileSync( join( dest, 'VERSION' ), version + '\n' );
console.log( `Copied dompdf.js ${ version } to modules/Export/assets/vendor/dompdf` );
