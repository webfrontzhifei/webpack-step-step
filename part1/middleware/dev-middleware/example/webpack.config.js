/**
 * Created by vajoylarn on 2017/6/13.
 */
let path = require('path');
let MyPlugin = require('./MyPlugins.js');
module.exports = {
    entry: './app.js',
    output: {
        publicPath: "/assets/",
        filename: 'bundle.js',
        //path: '/'   //只使用 dev-middleware 可以忽略本属性
    },
    plugins: [
      new MyPlugin()
    ],
};
