/**
 * Created by Administrator on 2017/6/13.
 */
import {init} from './src/js/page/index';

//灰常重要，知会 webpack 允许此模块的热更新
if (module.hot) {
    module.hot.accept();
}

init();
