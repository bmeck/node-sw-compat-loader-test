const path = require('path');

module.exports = {
  entry: './src/index.js',
  target: 'web',
  node: {
    fs: 'empty',
    net: 'empty',
    module: 'empty',
  },
  output: {
    //libraryTarget: "umd",
    //library: 'Test',
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  }
};