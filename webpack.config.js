const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const fs = require('fs');
const path = require('path');

const modulesDir = path.resolve(process.cwd(), 'modules');

// One config per module that has resources/js/index.js, so each module
// builds into its own modules/<Name>/build/. A separate config per module
// is required because wp-scripts cleans the whole output path on build.
module.exports = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => path.join(modulesDir, dirent.name))
    .filter((moduleDir) => fs.existsSync(path.join(moduleDir, 'resources/js/index.js')))
    .map((moduleDir) => ({
        ...defaultConfig,
        entry: {
            index: path.join(moduleDir, 'resources/js/index.js'),
        },
        output: {
            ...defaultConfig.output,
            path: path.join(moduleDir, 'build'),
        },
    }));
