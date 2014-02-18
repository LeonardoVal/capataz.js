/** Test for the Capataz server, making a distributed (very) brute force 
	estimation of Pi.
*/
"use strict";
var PORT = 8080,
	RADIUS_EXP = 32,
	RADIUS = Math.pow(2, RADIUS_EXP) - 1,
// imports
	basis = require('../static/basis'),
	capataz_node = require('../capataz_node'),
	capataz = new capataz_node.Capataz();

function job_function(from, to, r) {
	var s = 0.0;
	for (var x = from; x < to; x++) {
		s += Math.sqrt(r * r - x * x);
	}
	return s / r / r * 4;
}
	
basis.Future.sequence(
	basis.Iterable.range(30).product(basis.Iterable.range(17)),
	function (pair) {
		var repetition = pair[0],
			jobCount = Math.pow(2, pair[1]),
			step = Math.round((RADIUS + 1) / jobCount),
			pi = 0,
			//TODO tag = 'radius=2^'+ RADIUS_EXP +'-1,jobCount=2^'+ jobCountExp;
			fulltimeStat = capataz.statistics.stat({key:'fulltime', step: step});
		fulltimeStat.startTime();
		return capataz.scheduleAll(basis.Iterable.range(0, RADIUS, step).map(function (x) {
			return {
				fun: job_function,
				args: [x, x + step, RADIUS],
				info: 'x <- ['+ x + ', '+ (x + step) +')'
			};
		}), 1000, function (scheduled) {
			scheduled.then(function (result) {
				pi += result;
			});
		}).then(function (values) {
			fulltimeStat.addTime();
			var pi_error = Math.abs(Math.PI - pi);
			capataz.statistics.add({key:'estimation_error', step:step}, pi_error);
			capataz.logger.info('Repetition #'+ repetition +' with step '+ step +' finished. PI = ', pi, 
				' (error ', pi_error, ').');
		});
	}).then(function () {
		process.exit();
	});

capataz.logger.appendToConsole();
capataz.configureApp({
	staticPath: __dirname +'/../static',
	logFile: './tests/logs/capataz-'+ basis.Text.formatDate(new Date(), 'yyyymmdd-hhnnss') +'.log'
}).listen(PORT);
capataz.logger.info('Server started and listening at port ', PORT, '.');