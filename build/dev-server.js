wenrequire('./check-versions')();

var config = require('../config');
if(!process.env.NODE_ENV) {
  process.env.NODE_ENV = JSON.parse(config.dev.env.NODE_ENV);
}

var opn = require('opn');
var path = require('path');
var express = require('express');
var webpack = require('webpack');
var proxyMiddleware = require('http-proxy-middleware');
var webpackConfig = require('./webpack.dev.conf');

var port = process.env.port || config.dev.port;
var autoOpenBrowser = !!config.dev.autoOpenBrowser;

var proxyTable = config.dev.proxyTable;

var app = express();
var compiler = webpack(webpackConfig);

var devMiddleware = require('webpack-dev-middleware')(compiler, {
  publicPath: webpackConfig.output.publicPath,
  quiet: true
});

var hotMiddleware = require('webpack-hot-middleware')(compiler, {
  log: () => {}
});

compiler.plugin('compilation', function(compilation) {
  compilation.plugin('html-webpack-plugin-after-emit', function(data, cb) {
    hotMiddleware.publish({action: 'reload'});
    cb();
  });
});

Object.keys(proxyTable).forEach(function (context) {
  var options = proxyTable[context];
  if(typeof options === 'string') {
    options = { target: options };
  }
  app.use(proxyMiddleware(options.filter || context, options));
});
