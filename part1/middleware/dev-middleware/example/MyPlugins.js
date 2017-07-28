function MyPlugin(options) {

}

MyPlugin.prototype.apply = function(compiler) {
  compiler.plugin('compile', function(params) {
    console.log('the comiler is starting to compile....');
  });
  compiler.plugin('compilation', function(compilation) {
    console.log('the comiler is starting a new compilation...');
  });
};

module.exports = MyPlugin;
