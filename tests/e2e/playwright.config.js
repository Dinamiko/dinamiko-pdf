const path = require( 'path' );
const { defineConfig } = require( '@playwright/test' );
const baseConfig = require( '@wordpress/scripts/config/playwright.config.js' );

module.exports = defineConfig( {
	...baseConfig,
	testDir: path.join( __dirname, 'specs' ),
} );
