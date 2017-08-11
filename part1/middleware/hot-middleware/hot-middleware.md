### wepack-hot-middleware 深入解读

1. webpack-hot-middleware 做什么的？
   webpack-hot-middleware 是和webpack-dev-middleware配套使用的。从上一篇文章中知道，webpack-dev-middleware是一个express中间件，实现的效果两个，一个是在fs基于内存，提高了编译读取速度；第二点是，通过watch文件的变化，动态编译。但是，这两点并没有实现浏览器端的加载，也就是，只是在我们的命令行可以看到效果，但是并不能在浏览器动态刷新。那么webpack-hot-middleware就是完成这件小事的。没错，这就是一件小事，代码不多，后面我们就深入解读。
2. webpack-hot-middleware 怎么使用的？
   [官方文档](https://github.com/glenjamin/webpack-hot-middleware)已经很详细的介绍了，那么我再重复一遍。
   1. 在plugins中增加HotModuleReplacementPlugin().
   2. 在entry中新增webpack-hot-middleware/client
   3. 在express中加入中间件webpack-hot-middleware.
   4. 在入口文件添加
   ```js
   //灰常重要，知会 webpack 允许此模块的热更新
   if (module.hot) {
       module.hot.accept();
   }
   ```
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

      line 4-33，做了一件事，就是配置，根据__resourceQuery,转化查询字符串中的配置项？不明白。__resourceQuery是webpack中的默认API，表示require某个模块时的查询字符串。例如，我们在entry的client.js这样写。
      ```js
        entry: ['webpack-hot-middleware/client.js?name="zzf"', './app.js'],
      ```

      那么，在client.js中取到__resourceQuery的值就是?name="zzf"

      line 35-45,一次判断是否为客户端浏览器，是否支持EventSource。如果都支持的话，connect()连接server端。connect()方法就是这个client.js的全部了。

      ```js
      function connect() {
        getEventSourceWrapper().addMessageListener(handleMessage);

        function handleMessage(event) {
          if (event.data == "\uD83D\uDC93") {
            return;
          }
          try {
            processMessage(JSON.parse(event.data));
          } catch (ex) {
            if (options.warn) {
              console.warn("Invalid HMR message: " + event.data + "\n" + ex);
            }
          }
        }
      }
      ```

      line104执行了哪些呢？

      ```js
      function getEventSourceWrapper() {
        if (!window.__whmEventSourceWrapper) {
          window.__whmEventSourceWrapper = {};
        }
        if (!window.__whmEventSourceWrapper[options.path]) {
          // cache the wrapper for other entries loaded on
          // the same page with the same options.path
          window.__whmEventSourceWrapper[options.path] = EventSourceWrapper();
        }
        return window.__whmEventSourceWrapper[options.path];
      }
      ```
      上述主要执行了就是创建了EventSourceWrapper()的对象。那么EventSourceWrapper()执行了什么呢？

      ```js
      function EventSourceWrapper() {
        var source;
        var lastActivity = new Date();
        var listeners = [];

        init();
        var timer = setInterval(function() {
          if ((new Date() - lastActivity) > options.timeout) {
            handleDisconnect();
          }
        }, options.timeout / 2);

        function init() {
          source = new window.EventSource(options.path);
          source.onopen = handleOnline;
          source.onerror = handleDisconnect;
          source.onmessage = handleMessage;
        }

        function handleOnline() {
          if (options.log) console.log("[HMR] connected");
          lastActivity = new Date();
        }

        function handleMessage(event) {
          lastActivity = new Date();
          for (var i = 0; i < listeners.length; i++) {
            listeners[i](event);
          }
        }

        function handleDisconnect() {
          clearInterval(timer);
          source.close();
          setTimeout(init, options.timeout);
        }

        return {
          addMessageListener: function(fn) {
            listeners.push(fn);
          }
        };
      }
      ```
      主要执行逻辑就是在init()方法中，就是新建一个window.EventSource(options.path)对象。然后通过每隔10s轮询判断是否，已经20s(两次)连接失败了，就断开本次连接，然后在timeout20s后，重新尝试建立连接。最后返回一个对象，也就是对外抛出一个可以添加listener的口子。

      line106-117,添加了这个事件监听处理函数，handleMessage(event)方法。这个方法，首先根据服务端返回的数据，是不是（心形 没错 "\uD83D\uDC93"就是红心），如果是，表示正常的轮询，直接return就可以。如果不是，调用processMessage处理，根据不同action，有不同的行为。这也就是middleware.js中的action行为。

      我们再深入processMessage()方法，前两个action："building","built"就很简单了，就是一个console.log()提示。如果是sync就分多种情况了，warn,error。通过reporter(下文创建的)去处理。最后调用了processUpdate()，下文再详解。

      还有两部分没有分析，就是createReporter().line134-190分析得到如下结论，reporter简单的区分了warn，error，并以不同的style（console控制台样式，不知道的自行恶补）提示信息。并且，如果是编译错误信息，通过overlay.js展示错误信息（创建一个遮罩层，打印出错误信息）。

      现在，还遗漏了一个文件的分析，也就是processUpdate()方法。这其实是核心的玩意儿啊，不容忽视。分析后，就会发现，至此为止，还少了至关重要的一部，EventStream只是将变化，通知给了client端，但是client端怎么实现hmr的呢？核心逻辑就在processUpdate()方法中。

      ```js
      // Based heavily on https://github.com/webpack/webpack/blob/
      //  c0afdf9c6abc1dd70707c594e473802a566f7b6e/hot/only-dev-server.js
      ```
      依赖这个玩意儿啊，hot/only-dev-server.js，这个玩意儿的分析在下一篇webpack-dev-server会深入分析。

      返回正题，这里，line9-11判断了module.hot如果不支持，直接抛出error，这也就是webpack-hot-middleware必须配合HotModuleReplacementPlugin使用的原因，它是给webpack添加了module.hot能力的啊。

      line24-132,也就是整个方法了，这个方法嵌套的还是蛮深的。

      ```js
      var reload = options.reload;
      if (!upToDate(hash) && module.hot.status() == "idle") {
        if (options.log) console.log("[HMR] Checking for updates on the server...");
        check();
      }
      ```
      首先获取options中的reload配置，还记得怎么配置的不？client.js?reload=true. 然后判断hash是否已经过期，也就是webpack进行了重新打包，manifest有变化，是的话，就check()检查变化的资源。

      ```js
      function upToDate(hash) {
        if (hash) lastHash = hash;
        return lastHash == __webpack_hash__;
      }
      ```
      检查hash是否过期的方法，使用了这样一个__webpack_hash，这个是webpack给出的一个常量（可以通过webpack官网查询），它表示资源的hash值，也就是已经在浏览器端加载的资源的hash值。而hash，从上文中，我们还记得，这个玩意儿是EventStream传过来的新的hash值。对的，没有看错，判断文件是否变化，就是这么简单。

      继续，check()方法。

      ![](http://otsuptraw.bkt.clouddn.com/%E5%B1%8F%E5%B9%95%E5%BF%AB%E7%85%A7%202017-08-10%20%E4%B8%8B%E5%8D%887.01.54.png)

      check()执行，从64行开始，module.hot.check(false, cb);[源文档](https://webpack.js.org/api/hot-module-replacement/)

      ```js
      module.hot.check(autoApply, (error, outdatedModules) => {
        // Catch errors and outdated modules...
      });
      ```
      这就明白了这里module.hot.check检查webpack打包资源是否变化，将会沿着依赖树往上遍历。

      再看一下回调函数cb
      ![](http://otsuptraw.bkt.clouddn.com/%E5%B1%8F%E5%B9%95%E5%BF%AB%E7%85%A7%202017-08-11%20%E4%B8%8A%E5%8D%8810.01.13.png)

      line33, 如果error，handleError()处理。handleError在line112-125很简单，就根据module.hot.status()获取hot module Replacement 进程的状态。(官方原话:Retrieve the current status of the hot module replacement process.),如果状态是abort或者fail,表示检查失败。。那么执行performReload().也就是刷新浏览器（window.location.reload()).

      回归正题，line35-42可以看到，虽然不是error，但是updatedModules为undefined,也就是同样没有找到，执行了一样的逻辑，performReload().

      line 52行，module.hot.apply()方法。为什么呢，还记得module.hot.check(false, cb)么，这里第一个参数为false表示需要手动调用module.hot.apply()。继续。

      module.hot.apply(applyOptions, applyCallback);
      ```js
      var applyOptions = { ignoreUnaccepted: true };
      ```
      这个option的意思就很清晰了。还记得第一步中的第四条么，这里就是它的用武之地了。

      ```js
      var applyCallback = function(applyErr, renewedModules) {
        if (applyErr) return handleError(applyErr);

        if (!upToDate()) check();

        logUpdates(updatedModules, renewedModules);
      };
      ```

      这里代码就好玩了。首先检查applyErr是否出现，出现的话，handleError处理。然后再次检查了hash是否最新，如果不是的话，重新执行了check().不知道会不会有死循环的风险。。。最后，就是logUpdate().没什么技术了就，简单区分了下，然后打印log信息。

      line52-60是promise的then处理。line64-71同样是如此。

      That's all!
4. 扩展。

   unref()方法。

   还记得在client.js中有这么一处代码么？
   ```js
   setInterval(function heartbeatTick() {
     everyClient(function(client) {
       client.write("data: \uD83D\uDC93\n\n");
     });
   }, heartbeat).unref();
   ```
   这里，我们就介绍一下这个unref()方法，看看[官网](https://nodejs.org/dist/latest-v6.x/docs/api/timers.html#timers_timeout_unref)是怎么介绍的。
   翻译成中文就是，当只有这一个timer处于active态时，并不需要事件循环去维持这个玩意儿，也就是process进程会退出。当然，如果有其他timer或者活动需要事件循环时，它也是可以跑着的。还不理解，这就是俗话：哎呀，我随便，你们要是没有吃的，我也不要了，要是有要的，就也给我一份。

   哈哈。
   测试一下！

   ```js
   var timer1 = setInterval(function() {
     console.log('timer1');
   }, 1000).unref();
   ```
   没有任何输出。

   ![](http://otsuptraw.bkt.clouddn.com/%E5%B1%8F%E5%B9%95%E5%BF%AB%E7%85%A7%202017-08-11%20%E4%B8%8A%E5%8D%8810.59.31.png)

   ```js
   var timer1 = setInterval(function() {
     console.log('timer1');
   }, 1000).unref();

   var timer2 = setInterval(function() {
     console.log('timer2');
   }, 1000);
   ```

   ![](http://otsuptraw.bkt.clouddn.com/%E5%B1%8F%E5%B9%95%E5%BF%AB%E7%85%A7%202017-08-11%20%E4%B8%8A%E5%8D%8810.59.47.png)
