/** # Pi estimation

This is a test of the Capataz server, making a distributed (very) brute force 
estimation of Pi.
*/
"use strict";
/** Import dependencies ...
*/
var fs = require('fs'),
	capataz_node = require('../build/capataz_node.min'),
	base = capataz_node.__dependencies__.base,
/** ... and define this run's parameters.
*/
	CONFIG = {
		radius: Math.pow(2, 32) - 1,
		repetitions: 40,
		jobCounts: base.Iterable.range(17).map(function (e) { 
			return Math.pow(2, e);
		}).toArray(),
		taskSizes: [1, 10, 20, 30, 50, 100]
	},
/** Configure and start the server instance.
*/
	capataz = capataz_node.Capataz.run({
		workerCount: -2,
		desiredEvaluationTime: 5000,
		port: 80,
		logFile: base.Text.formatDate(null, '"./tests/logs/pi_estimation-log-"yyyymmdd-hhnnss".txt"'),
	});

/** The jobs are based on this function.
*/
function job_function(from, to, r) {
	var s = 0.0;
	for (var x = from; x < to; x++) {
		s += Math.sqrt(r * r - x * x);
	}
	return s / r / r * 4;
}

/** This function can be used to generate errors in the workers.
*/
function jobError_function() {
	throw new Error("Failing on purpose.");
}

/** The test performs many repetitions of the estimation, dividing the 
complexity among different amounts of jobs. 
*/
base.Future.sequence(base.Iterable.range(CONFIG.repetitions).product(CONFIG.jobCounts, CONFIG.taskSizes), function (args) {
	var repetition = +args[0],
		jobCount = +args[1],
		taskSize = +args[2],
		step = Math.round((CONFIG.radius + 1) / jobCount),
		pi = 0,
/** Tags are used to separate the statistics of runs with different parameters.
*/
		tags = { 
			step: base.Text.lpad(''+ step, Math.ceil(Math.log(CONFIG.radius) / Math.log(10)), '0'),
			taskSize: base.Text.lpad(''+ taskSize, 3, '0')
		},
		fulltimeStat = capataz.statistics.stat(base.copy({key:'fulltime'}, tags));		
/** This function returns a future that accumulates results and accounts errors.
*/
	function accumulate(job) {
		return job.then(function (result) {
			pi += result;
		}, function (err) { // Ignore error.
			capataz.statistics.add(base.copy({key:'rejected_jobs', err: ''+ err }, tags), 1);
		});
	}
		
	fulltimeStat.startTime();
/** Here all jobs are generated. Basically the range [0, CONFIG.radius) is split 
in `jobCount` jobs. Each job is a call to `job_function` with a slice of the 
domain (left and right borders) and the `CONFIG.radius` value. No imports are 
needed, and the `info` is provided to improve clients' logs.
*/
	capataz.config.maxTaskSize = taskSize;
	return capataz.scheduleAll(base.Iterable.range(0, CONFIG.radius, step).map(function (x) {
		return { 
			fun: job_function, 
			args: [x, x + step, CONFIG.radius],
			info: 'x <- ['+ x + ', '+ (x + step) +')', 
			tags: tags
		};
/**	The `scheduleAll` method takes from the generator in chunks of 1000 jobs,
scheduling and waiting before dealing with the next chunk. At each scheduled
job this callback is called. This allows to work with the future of the
scheduled job. In this case, only a simple aggregation of the results is needed.
*/
	}), 1000, function (scheduled) {
		return accumulate(scheduled, tags);
/** The future returned by `scheduleAll` is fulfilled when all jobs have been
completed. Here the estimation error is calculated, logged, and added to the run
statistics. The statistic used to adjust the task size is reset.
*/
	}).then(function (values) {
		fulltimeStat.addTime();
		var pi_error = Math.abs(Math.PI - pi),
			jobs_per_task = capataz.statistics.stat({key:"jobs_per_task"});
		capataz.statistics.add(base.copy({key:'estimation_error'}, tags), pi_error);
		capataz.logger.info('Repetition #', repetition, ' with step ', step,
			' finished. PI = ', pi, ' (error ', pi_error, ').');
		capataz.statistics.addStatistic(jobs_per_task, base.copy({key:'task_size'}, tags));
		// Write stats file
		var statFilePath = './tests/logs/capataz-stats-'+
			base.Text.formatDate(new Date(capataz.__startTime__), 'yyyymmdd-hhnnss') +
			'-r'+ base.Text.lpad(''+ repetition, 3, '0') +'.txt';
		fs.writeFileSync(statFilePath, capataz.statistics +'\n');
		// Reset stats.
		jobs_per_task.reset();
		capataz.statistics.reset({key:'estimated_time'});
	});
/** The future build by `Future.sequence` is fulfilled when all repetitions have
been completed. Here the server is shut down.
*/
}).then(function () {
	capataz.logger.info('Run statistics:\n'+ capataz.statistics);
	process.exit();
});