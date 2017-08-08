/**
 * Created by vajoylarn on 2017/6/13.
 */
const path = require('path');
const webpack = require('webpack');
const htmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: './app.js',
    output: {
        publicPath: "/assets/",
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist','assets'),
    },
    devServer: {
        // contentBase: path.join(__dirname, "src/html"),
        port: 3333,
        hot: true,
    },

    plugins: [
        new htmlWebpackPlugin({
          template: path.resolve(__dirname, './src/html/index.html'),
          title: 'test',
          filename: '../../index.html',
        }),
        // new webpack.HotModuleReplacementPlugin()
    ]
};
