require('./check-versions')();

var config = require('../config');
console.log(config.dev.env.NODE_ENV);
console.log(JSON.parse(config.dev.env.NODE_ENV));
// if(!process.env.NODE_ENV) {
//   process.env.NODE_ENV =
// }
