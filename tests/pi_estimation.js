/** # Pi estimation

This is a test of the Capataz server, making a distributed (very) brute force 
estimation of Pi.
*/
"use strict";
/** Import dependencies ... */
var base = require('creatartis-base'),
	capataz_node = require('../build/capataz_node'),
/** ... and add a few parameter definitions. */
	PORT = 8080,
	RADIUS = Math.pow(2, 28) - 1,
	REPETITIONS = 30,
	JOB_COUNTS = base.Iterable.range(17).map(function (e) { 
		return 1 << e;
	}).toArray(),
/** Create the server instance. */
	capataz = new capataz_node.Capataz();

/** The job is based on this function. */
function job_function(from, to, r) {
	var s = 0.0;
	for (var x = from; x < to; x++) {
		s += Math.sqrt(r * r - x * x);
	}
	return s / r / r * 4;
}

/** The test performs many repetitions of the estimation, dividing the 
complexity among different amounts of jobs. 
*/
base.Future.sequence(base.Iterable.range(REPETITIONS).product(JOB_COUNTS), function (pair) {
	var repetition = pair[0],
		jobCount = pair[1],
		step = Math.round((RADIUS + 1) / jobCount),
		pi = 0,
		fulltimeStat = capataz.statistics.stat({key:'fulltime', step: step});
	fulltimeStat.startTime();
/** Here all jobs are generated. Basically the range [0, RADIUS) is split in
`jobCount` jobs. Each job is a call to `job_function` with a slice of the domain
(left and right borders) and the `RADIUS` value. No imports are needed, and the
`info` is provided to improve clients' logs.
*/
	return capataz.scheduleAll(base.Iterable.range(0, RADIUS, step).map(function (x) {
		return {
			fun: job_function,
			args: [x, x + step, RADIUS],
			info: 'x <- ['+ x + ', '+ (x + step) +')'
		};
/**	The `scheduleAll` method takes from the generator in chunks of 1000 jobs,
scheduling and waiting before dealing with the next chunk. At each scheduled
job this callback is called. This allows to work with the future of the
scheduled job. In this case, only a simple aggregation of the results is needed.
*/
	}), 1000, function (scheduled) {
		scheduled.then(function (result) {
			pi += result;
		});
/** The future returned by `scheduleAll` is fulfilled when all jobs have been
completed. Here the estimation error is calculated, logged and a few statistics
are added.
*/
	}).then(function (values) {
		fulltimeStat.addTime();
		var pi_error = Math.abs(Math.PI - pi);
		capataz.statistics.add({key:'estimation_error', step:step}, pi_error);
		capataz.logger.info('Repetition #'+ repetition +' with step '+ step +' finished. PI = ', pi, 
			' (error ', pi_error, ').');
	});
/** The future build by `Future.sequence` is fulfilled when all repetitions have
been completed. Here the server is shut down.
*/
}).then(function () {
	process.exit();
});

/** Server configuration includes setting up the logger properly, printing to 
a file with a time stamp and the console(standard output).
*/
capataz.logger.appendToConsole();
capataz.configureApp({
	staticPath: __dirname +'/../build/static',
	logFile: './tests/logs/capataz-'+ base.Text.formatDate(new Date(), 'yyyymmdd-hhnnss') +'.log'
/** The method `configureApp` creates and returns a 
[ExpressJS](http://expressjs.com/) application. It is started by calling 
`listen`.
*/
}).listen(PORT);

/** Finally a message is included in the log to indicate that the server started
properly.
*/
capataz.logger.info('Server started and listening at port ', PORT, '.');