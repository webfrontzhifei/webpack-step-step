### wepack-hot-middleware 深入解读

1. webpack-hot-middleware 做什么的？
   webpack-hot-middleware 是和webpack-dev-middleware配套使用的。从上一篇文章中知道，webpack-dev-middleware是一个express中间件，实现的效果两个，一个是在fs基于内存，提高了编译读取速度；第二点是，通过watch文件的变化，动态编译。但是，这两点并没有实现浏览器端的加载，也就是，只是在我们的命令行可以看到效果，但是并不能在浏览器动态刷新。那么webpack-hot-middleware就是完成这件小事的。没错，这就是一件小事，代码不多，后面我们就深入解读。
2. webpack-hot-middleware 怎么使用的？
   [官方文档](https://github.com/glenjamin/webpack-hot-middleware)已经很详细的介绍了，那么我再重复一遍。
   1. 在plugins中增加HotModuleReplacementPlugin().
   2. 在entry中新增webpack-hot-middleware/client
   3. 在express中加入中间件webpack-hot-middleware.
   详细的配置文件也可以看[我的github](https://github.com/webfrontzhifei/webpack-step-step/tree/master/part1/middleware/hot-middleware/example)

   ```js
   // webpack.config.js
   const path = require('path');
   const webpack = require('webpack');
   module.exports = {
       entry: ['webpack-hot-middleware/client.js', './app.js'],
       output: {
           publicPath: "/assets/",
           filename: 'bundle.js',
       },
       plugins: [
           new webpack.HotModuleReplacementPlugin(),
           new webpack.NoEmitOnErrorsPlugin()
       ]
   };
   // express.config.js
   app.use(require("webpack-hot-middleware")(compiler, {
       path: '/__webpack_hmr',
   }));

   app.get("/", function(req, res) {
       res.render("index");
   });

   app.listen(3333);
   ```
3. 重点，重点，重点，源代码分析。
   通过上面的配置，我们可以发现webpack实现了热加载，那么是如何实现的呢？进入正题。

   1. webpack-hot-middleware中的入口文件middleware.js，哇，只有100多行。
   整个文件的结构如下：

   ![文件结构](http://otsuptraw.bkt.clouddn.com/hot-middleware.js.PNG)

   文件结构能够看到line6-36是核心。那么，我们深入分析，

   line7-10定义了基本的option，分别定义了option的log方法，path路径以及server的socket响应时间。（哈哈，log方法怎么在插件都进行了定义！！！）

   line 12创建了eventStream对象，这是个什么呢？line38-76,
   ![](http://otsuptraw.bkt.clouddn.com/createEventStream.PNG)

   好简单，就是执行了这两行，
   ```js
   setInterval(function heartbeatTick() {
     everyClient(function(client) {
       client.write("data: \uD83D\uDC93\n\n");
     });
   }, heartbeat).unref();
   ```
   每间隔heartbeat秒，遍历clients，每个client socket eventStream 写一个心（红心）。
   ![红心](http://otsuptraw.bkt.clouddn.com/heart.PNG)
   最后返回了一个handler以及publish方法的对象，也就是eventStream。

   下一步就是line 15,在compiler编译时，加入一个回调处理函数。
   ```js
   compiler.plugin("compile", function() {
     latestStats = null;
     if (opts.log) opts.log("webpack building...");
     eventStream.publish({action: "building"});
   });
   ```
   上述这种通过node定义webpack插件的方式很常见（其实可以理解为加入了一个事件处理函数）。它做了什么呢？对你的代码（如果参考我的代码的话，改变index.js即可），会发生什么呢？

   ![](http://otsuptraw.bkt.clouddn.com/%E5%B1%8F%E5%B9%95%E5%BF%AB%E7%85%A7%202017-08-10%20%E4%B8%8A%E5%8D%889.39.37.png)

   也就是通过客户端EventStream，向浏览器发送消息（"action: building").

   ok!还有另一个（一共只有两个，窃喜，好简单）。

   ```js
   compiler.plugin("done", function(statsResult) {
     // Keep hold of latest stats so they can be propagated to new clients
     latestStats = statsResult;
     publishStats("built", latestStats, eventStream, opts.log);
   });
   ```

   另一个函数啊，publishStats().函数内部，又调用了extractBundles()，以及buildModuleMap

   ```js
   function extractBundles(stats) {
     if (stats.modules) return [stats];
     if (stats.children && stats.children.length) return stats.children;
     return [stats];
   }
   ```

   很简单的几行，就是将stats包装为数组，有子元素children，直接用，没有，就[stats]。

   buildModuleMap就简单了，建立了一个key，value的map映射。

   这就简单了，回到compiler的done回调函数，整个流程就是执行了抽取bundle，每个bundle执行一次eventStream的publish回调。

   实例效果，也就是上图展示的那样了，那个built，看清楚了吧。

   那么，接着继续！line25-35.

   ```js
   var middleware = function(req, res, next) {
     if (!pathMatch(req.url, opts.path)) return next();
     eventStream.handler(req, res);
     if (latestStats) {
       // Explicitly not passing in `log` fn as we don't want to log again on
       // the server
       publishStats("sync", latestStats, eventStream);
     }
   };
   middleware.publish = eventStream.publish;
   return middleware;
   ```

   重点来了。返回的中间件middleware,流程是这样滴：判断是不是__webpack_hmr(默认，可配置)，不是的话跳过，执行next()。是请求__webpack_hmr的话呢，执行eventStream的handler方法，处理请求。

   ```js
   handler: function(req, res) {
     req.socket.setKeepAlive(true);
     res.writeHead(200, {
       'Access-Control-Allow-Origin': '*',
       'Content-Type': 'text/event-stream;charset=utf-8',
       'Cache-Control': 'no-cache, no-transform',
       'Connection': 'keep-alive',
       // While behind nginx, event stream should not be buffered:
       // http://nginx.org/docs/http/ngx_http_proxy_module.html#proxy_buffering
       'X-Accel-Buffering': 'no'
     });
     res.write('\n');
     var id = clientId++;
     clients[id] = res;
     req.on("close", function(){
       delete clients[id];
     });
   },
   ```

   其实就是，建立了一个eventStream。关键点：Content-Type: 'text/event-stream'。并且记录了请求的clients.

   line29-32,就是判断如果已经编译完成，就向浏览器publish一个sync的消息。

   至此,这个hot-middleware的服务器端的整个执行过程就分析完了。我们上文一直提到eventStream,作为EventStream，如果少了客户端怎么行呢？哈哈，别漏了这么重要的角色。

   2. client.js
      你应该还记得，上文中的配置webpack.config.js中，在entry中引入的“webpack-hot
      -middleware/client.js”,对，这个就是client.js登上舞台的入口。
4. 扩展。
   unref以及plugin两种定义方式。
