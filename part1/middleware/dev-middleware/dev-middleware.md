### webpack-dev-middleware 解读
 1. 简单介绍
    webpack-dev-middleware,作用就是，生成一个与webpack的compiler绑定的中间件，然后在express启动的服务app中调用这个中间件。
    这个中间件的作用呢，简单总结为以下三点：通过watch mode，监听资源的变更，然后自动打包（如何实现，见下文详解);快速编译，走内存；返回中间件，支持express的use格式。特别注明：webpack明明可以用watch mode，可以实现一样的效果，但是为什么还需要这个中间件呢？
    答案就是，第二点所提到的，采用了内存方式。如果，只依赖webpack的watch mode来监听文件变更，自动打包，每次变更，都将新文件打包到本地，就会很慢。
 2. 实践出真知
    webpack-dev-middleware 使用配置很简单，只需几步，就可以。项目代码，参考[源码](https://github.com/webfrontzhifei/webpack-step-step.git);

    step1: 配置publicPath.

      publicPath,熟悉webpack的同学都知道，这是生成的新文件所指向的路径，可以模拟CDN资源引用。那么跟此处的主角webpack-dev-middleware什么关系呢，关系就是，此处采用内存的方式，内存中采用的文件存储write path就是此处的publicPath，因此，这里的配置publicPath需要使用相对路径。

      ```js
      let path = require('path');

      module.exports = {
          entry: './app.js',
          output: {
              publicPath: "/assets/",
              filename: 'bundle.js',
              //path: '/'   //只使用 dev-middleware 可以忽略本属性
          },
      };

      ```
    step2: express server中引入中间件。

    ```js
    const path = require('path');
    const express = require("express");
    var ejs = require('ejs');
    const app = express();
    const webpack = require('webpack');
    const webpackMiddleware = require("webpack-dev-middleware");
    let webpackConf = require('./webpack.config.js');

    app.engine('html', ejs.renderFile);
    app.set('views', path.join(__dirname, 'src/html'));
    app.set("view engine", "html");

    var compiler = webpack(webpackConf);

    app.use(webpackMiddleware(compiler, {
        publicPath: webpackConf.output.publicPath,
    }));

    app.get("/", function(req, res) {
        res.render("index");
    });

    app.listen(3333);
    ```

    通过step1以及step2，就能看到webpack的热家载效果了。
