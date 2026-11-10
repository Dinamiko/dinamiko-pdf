const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const path = require('path');

module.exports = {
    ...defaultConfig,
    entry: {
        'sample': path.resolve(process.cwd(), 'resources/js/sample', 'index.js'),
    },
    output: {
        filename: '[name].js',
        path: path.resolve(process.cwd(), 'build'),
    },
};
