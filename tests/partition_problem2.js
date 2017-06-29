/** # Partition problem 2

Example problem used in the [second example](../docs/tutorial.md.html#second example) of the
tutorial. Please see the [first example](partition_problem1.js.html) before reading this.
*/
"use strict";
require('source-map-support').install();

/** In this version of the problem some of the logic will be put in a [RequireJS](http://www.requirejs.org)
module. Since it will have to be loaded by the clients, the server must be configured to serve it.
Hence the `customFiles` parameter is added to the server's configuration, pointing at the folder
that contains the module file. All the rest is the same as the previous example.
*/
var capataz = require('../build/capataz_node'),
	base = capataz.__dependencies__.base,
	server = capataz.Capataz.run({
		port: 8080,
		logFile: base.Text.formatDate(null, '"./tests/logs/partition_problem2-log-"yyyymmdd-hhnnss".txt"'),
		customFiles: './tests/partition_problem_static'
	});

/** The numbers could have been added to the module as well, but then it would be harder to
experiment with different lists of numbers.
*/
var NUMBERS = [61, 83, 88, 94, 121, 281, 371, 486, 554, 734, 771, 854, 885, 1003];

/** The `jobs` generator has two major changes. First the former `jobFunction` definition is
missing, since it has been moved to the RequireJS module. Clients are told to load this module by
adding its name (or path) in the `imports` field. Imported modules will be passed as arguments to
the job function, before the ones in `args`. Thats why the new `jobFunction` has an extra argument
`m`, for the module.
*/
var partitionCount = Math.pow(2, NUMBERS.length - 1) - 1,
	jobFunction = 'function(m,p,ns){return m.jobFunction(p,ns);}',
	jobs = base.Iterable.range(partitionCount).map(function (partition) {
		return {
			info: 'Partition #'+ partition,
			imports: ['partition_problem_module'],
			fun: jobFunction,
			args: [partition, NUMBERS]
		}
	});

/** Jobs are scheduled in the same way as before. Yet more of them can be scheduled at once, since
the new job definition is shorter than the one of the first example, and hence occupies less memory.
*/
server.logger.info("Numbers are ", JSON.stringify(NUMBERS));
server.scheduleAll(jobs, 2000, function (scheduled) {
	return scheduled.then(function (result) {
		if (result.diff == 0) {
			server.logger.info("Partition found (#"+ result.partition +"): ",
				JSON.stringify(result.list0), " and ", JSON.stringify(result.list1));
			return true;
		} else {
			return false;
		}
	});
}).then(function () {
	server.logger.info("Finished. Stopping server.");
	setTimeout(process.exit, 10);
});
