/** # Partition problem 1

Example problem used in the [first example](../docs/tutorial.md.html#first example) of the tutorial.
*/
"use strict";
require('source-map-support').install();

/** Import (or `require`) Capataz and start the server. The `Capataz.run` method will build, 
configure and start the server in one go. All parameters have default values, so it could be called 
without any. In this case we will make the server listen the standard HTTP port 80, since by default 
it would listen in in the port 8080.
*/
var capataz = require('../build/capataz_node'),
	base = capataz.__dependencies__.base,
	server = capataz.Capataz.run({
		port: 80,
		logFile: base.Text.formatDate(null, '"./tests/logs/partition_problem1-log-"yyyymmdd-hhnnss".txt"')
	});

/** The partition problem (see [1](http://en.wikipedia.org/wiki/Partition_problem) and 
[2](http://www.americanscientist.org/issues/pub/2002/3/the-easiest-hard-problem)) goes like this: 
given a list of numbers like the next one, the distributed algorithm must find out if the list can 
be split into two sublist, such that the sums for each sublist are equal.
*/
var NUMBERS = [61, 83, 88, 94, 121, 281, 371, 486, 554, 734, 771, 854, 885, 1003];

/** The `jobFunction` takes the `partition` number and uses it bits to split the `numbers` into two
lists. The result includes the `partition` number, both sublists (`list0` and `list1`), and the 
difference (`diff`) of both sublists sums. If `diff` is zero, then the given `partition` does split 
the `numbers` into two sublist with equal sums.
*/
function jobFunction(partition, numbers) {
	var bits = partition.toString(2),
		list0 = [], 
		list1 = [],
		sum = 0, number;
	while (bits.length < numbers.length) { // Left pad the bits.
		bits = '0'+ bits;
	}
	for (var i = 0; i < numbers.length; ++i) {
		number = numbers[i];
		if (bits.charAt(i) === '0') {
			list0.push(number);
			sum += number;
		} else { // bits.charAt(i) === '1'
			list1.push(number);
			sum -= number;
		}
	}
	return { partition: partition, list0: list0, list1: list1, diff: sum };
}

/** The amount of possible partitions (and hence of jobs) is `2^(NUMBERS.length-1)-1`. A list of all
the jobs in the whole run is implemented by a [Python-style generator
](https://wiki.python.org/moin/Generators) (using `base.Iterable`). This allows for all jobs to be 
listed without storing them all in memory at once.
*/
var partitionCount = Math.pow(2, NUMBERS.length - 1) - 1,
	jobs = base.Iterable.range(partitionCount).map(function (partition) {
		return {
			info: 'Partition #'+ partition, 
			fun: jobFunction,
			args: [partition, NUMBERS]
		}
	});

/** Last (but not least) jobs are scheduled in the server with the `scheduleAll` method. Besides the 
`jobs` generator we defined previously, it takes a number and a callback function. The number is the 
maximum amount of jobs that may be pending (and hence in memory) at any given moment. The callback 
function is called when a job gets scheduled to be performed and pending. In this case when the 
results are available the sum difference is checked. If it is zero we know a partition has been 
found, and the solution is logged.
*/
server.logger.info("Numbers are ", JSON.stringify(NUMBERS));
server.scheduleAll(jobs, 1000, function (scheduled) {
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