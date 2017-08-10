/**
 * Created by vajoylarn on 2017/6/13.
 */
const path = require('path');
const webpack = require('webpack');
module.exports = {
    entry: ['webpack-hot-middleware/client.js?reload=true', './app.js'],
    output: {
        publicPath: "/assets/",
        filename: 'bundle.js',
        //path: '/'   //ֻʹ�� dev-middleware ���Ժ��Ա�����
    },
    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NoEmitOnErrorsPlugin()   //����ʱֻ��ӡ���󣬵������¼���ҳ��
    ]
};
