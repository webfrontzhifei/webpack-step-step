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

    通过step1以及step2，就能看到webpack的热加载效果了，效果展示。

    ![效果展示](http://otsuptraw.bkt.clouddn.com/doc1.gif)

  3. 源码分析。

     step1:首先看webpack-dev-middleware包，项目目录结构为:

     ![项目结构](http://otsuptraw.bkt.clouddn.com/webpack-dev-middleware-struc.PNG)

     step2：逐一破解：

     middleware.js分析：
     line 6, var require("./lib/GetFilenameFromUrl");引入通过url得到fileName的方法；
     line 11，方法入口，引入compiler以及option配置，可以看到这是常规的结构方法，引入option，然后定义默认值（line 13),处理默认逻辑（line 22）.
     line 22, 初始化的处理，我们进入shared.js文件，深入分析一下。

     shared.js分析：
     share结构：

     ![对象结构](http://otsuptraw.bkt.clouddn.com/shared.js.PNG)

     line 223，share.setOptions(context.options);,此时的options是我们配置中的
     ```js
     {
         publicPath: webpackConf.output.publicPath,
     }
     ```
     line 9~36，定义了setOptions方法，简单一撇，重新定义了options的reporter方法，watchOptions.aggregateTimeout,options的stats（统计信息对象），mimeTypes定义。（配置信息不熟悉的可以参考官方[github仓库中的example](https://github.com/webpack/webpack-dev-middleware)

     line 224, share.setFs(context.compiler);

     可以看到，setFs方法做了两件事，检查compiler.outputPath是否为绝对路径（默认为process.cwd()），如果为相对路径，抛出错误；定义compiler.outputFileSystem = new MemoryFileSystem();这就是webpack-dev-middleware的精髓所在了，使用内存文件系统，而不是硬盘中的文件，这样能够提升编译的速度（稍后详细分析这个玩意儿)。

     line 226, context.compiler.plugin('done', share.compilerDone);

     定义了一个done事件钩子函数，该函数内主要是reporter编译的信息以及执行context.callbacks回调函数。

     line 227，228,229，源码：
     ```js
    context.compiler.plugin("invalid", share.compilerInvalid);
   	context.compiler.plugin("watch-run", share.compilerInvalid);
   	context.compiler.plugin("run", share.compilerInvalid);
     ```
     定义了一个invalid事件（监控的编译变无效后），watch-run(watch后开始编译之前)，run（读取记录之前）的回调，都是share.compilerInvalid方法，该方法主要还是根据state状态，report编译的状态信息。

     line 231，share.startWatch(),开始监控.可以看到主要逻辑在compiler.watch();纳尼？绕了一圈还是调用了compiler的原型方法watch。瞅一瞅，webpack/lib/compiler.js文件的line 216，
     ```js
     Compiler.prototype.watch = function(watchOptions, handler) {
     	this.fileTimestamps = {};
     	this.contextTimestamps = {};
     	var watching = new Watching(this, watchOptions, handler);
     	return watching;
     };
     ```
     同理，看到 webpack/lib/webpack.js的42行，可以看到，当webpack命令时，若有--watch，实际同样是调用的compiler.watch方法。

     line 85，可以看到return webpackDevMiddleware,最终返回了express的中间件。
