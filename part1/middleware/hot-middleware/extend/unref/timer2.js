var timer1 = setInterval(function() {
  console.log('timer1');
}, 1000).unref();

var timer2 = setInterval(function() {
  console.log('timer2');
}, 1000);
