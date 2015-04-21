Introduction to Capataz
=======================

This is a simple example on how to start using [Capataz](https://github.com/LeonardoVal/capataz.js), 
a distributed computing framework based on Javascript. Capataz works by setting up a web server, and
for that it uses [Node.js](http://nodejs.org/) and [Express](http://expressjs.com/). Every 
distributed algorithm is then a Node.js program that mounts a HTTP server to which the workers 
connect via standard web browsers. Since every end-user device with an internet connection almost
certainly has one or more web browsers, Capataz can mount a distributed algorithm on a lot of 
different platforms.

## First example

This example requires Node.js properly installed. The `node` and `npm` programs should be accessible 
in the command line. 

### Installation

To start we create a folder `capataz_project` for our example project. The first file to add is the 
standard Node.js project description, a JSON file called `package.json`. This metadata includes the 
dependencies of project, which can then be handled using the Node Package Manager or `npm`. The file
will look like this:

```json
{
	"name": "capataz_example",
	"dependencies": {
		"source-map-support": "~0.2.6",
		"capataz": "~0.1.2"
	}
}
```

With this file in the folder we can now run `npm install` to download and install all dependencies.
The library `source-map-support` is included to ease the debugging, since the build of Capataz 
includes [source maps](http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/).

After the installation a folder `node_modules` should have appeared in our project folder. It 
contains all the libraries required. We can test this by executing the Node.js's interpreter `node`
and writing:

```
> require('capataz');
{ dependencies: { ... }, Capataz: { [Function] ... }}
```

### Main script

Capataz is designed to be a library to be imported and used, rather than a service to connect and 
use. For this reason we need to write our distributed run's main program to make it work. Let's 
write a Node.js script, with the very original name `main.js`.

The first two lines simply set up the environment to make debugging easier:

```javascript
"use strict";
require('source-map-support').install();
```

After that we will import (or `require`) Capataz. The `Capataz.run` method will build, configure and
start the server in one go. All parameters have default values, so it could be called without any.
In this case we will make the server listen the standard HTTP port 80, since by default it would 
listen in in the port 8080.

```javascript
var capataz = require('capataz'),
	base = capataz.dependencies.base,
	server = capataz.Capataz.run({
		port: 80
	});
```

What workload are we going to distribute? Since this is a small example, we will use a simple 
problem: a partition problem (see [1](http://en.wikipedia.org/wiki/Partition_problem) and 
[2](http://www.americanscientist.org/issues/pub/2002/3/the-easiest-hard-problem)). Given a list of 
numbers like this one:

```javascript
var NUMBERS = [61, 83, 88, 94, 121, 281, 371, 486, 554, 734, 771, 854, 885, 1003];
```

the distributed algorithm will have to find out if the list can be split into two sublist, such that
the sums for each sublist are equal. 

We need to put in a function all the code the clients will have to execute. Basically, a job for
Capataz is a call to a function that does all the work. This function may require other modules,
which can be loaded via [RequireJS](http://requirejs.org/). The job function can be written as 
follows:

```javascript
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
```

The result of the job function includes the `partition` number, both sublists (`list0` and `list1`),
and the difference (`diff`) of both sublists sums. If `diff` is zero, then the given `partition` 
does split the `numbers` into two sublist with equal sums. 

The `jobFunction` is only a part of every job. The arguments of the call make the rest of it. The 
amount of possible partitions (and hence of jobs) is `2^(NUMBERS.length-1)-1`. A list of all the 
jobs in the whole run is implemented by a [Python-style generator](https://wiki.python.org/moin/Generators)
(using `base.Iterable`). This allows for all jobs to be listed without storing them all in memory at
once.
 
```javascript
var partitionCount = Math.pow(2, NUMBERS.length - 1) - 1,
	jobs = base.Iterable.range(partitionCount).map(function (partition) {
		return {
			info: 'Partition #'+ partition, 
			fun: jobFunction,
			args: [partition, NUMBERS]
		}
	});
```

Every jobs is defined by an object with the job function (`fun`) and its arguments (`args`). The 
arguments are the partition number and the list of all numbers (`NUMBERS`). The text in the `info`
field will be shown to the user in the browser's log, and its optional.

Last (but not least) jobs have to be scheduled in the server. Jobs may be scheduled one by one (by
calling the server's `schedule` method), but then most (of all) jobs will be stored into memory at 
once. In order to avoid this we will use the server's `scheduleAll` method. Besides the `jobs` 
generator we defined previously, it takes a number and a callback function. The number is the 
maximum amount of jobs that may be pending (and hence in memory) at any given moment. 

The callback function is called when a job gets scheduled to be performed and pending. The 
`scheduled` argument is an instance of `base.Future`, our implementation of 
[promises](https://www.promisejs.org/). Promises are a great abstraction to deal with asynchronism. 
Simply put, they are objects that represent a computation or process that will finished at an 
indeterminate moment. We have to provide a callback to be called when that happens. This is done
with the `then` method. In this case when the results are available the sum difference is checked. 
If it is zero we know a partition has been found, and the solution is logged.

```javascript
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
	process.exit();
});
```

The `scheduleAll` method also returns a promise. One that will be fulfilled when all `jobs` are 
finished. Here we log a salutation and close the program (with `process.exit`).

### Running the server

To run the `main.js` script execute `node main.js` in the command line interface. It should look as
follows:

```
**/capataz_project> node main.js
INFO  120000.000 Setting up the Capataz server.
INFO  120000.018 Server started and listening at port 80.
INFO  120000.019 Numbers are [61,83,88,94,121,281,371,486,554,734,771,854,885,1003]
```

After this clients may connect to server with any modern web browser. 
[EcmaScript 5](http://www.ecma-international.org/ecma-262/5.1/) and 
[web worker](http://www.w3.org/TR/workers/) support is strongly recommended. They should be able to 
see a web page with the title `COMPUTER AT WORK`, and in the body the execution log in monospaced 
font.

When all jobs get done, in the server the log should look like this:

```
INFO  120149.274 Partition found (#3484): [61,83,121,486,554,885,1003] and [88,94,281,371,734,771,854]
INFO  120221.029 Partition found (#7267): [61,121,281,371,734,771,854] and [83,88,94,486,554,885,1003]
INFO  120229.009 Finished. Stopping server.
```

The given numbers spawn only 8192 jobs. These can be finished in a few minutes in any modern desktop 
computer. Yet is the amount of numbers is increased the amount of work raises exponentially. It is 
a brute force approach to a NP-complete problem, after all. Add ten more numbers and you would be 
dealing with more than a thousand times more jobs. It will probably require multiple clients to do 
all that work in a reasonable time.

It is worth noting that the clients will keep on asking jobs even after the server has been 
shutdown. Such behaviour is intended to cope with unreliable network connections and hosting, making
the system more robust.

## Second example

Probably the logic the one may want to distribute is going to be far more complicated than the one 
of the first example. It is true that still all can be put into one function definition, but it will
cause two big problems. First, job functions are serialized and transmitted to the clients every 
time. Bulky functions will require an excessive bandwidth. Second, job definitions are stored in 
memory in the server. Big functions will require also an excessive amount of memory. Neither of 
these is an inexpensive commodity, specially in cloud hosting.

One solution is to put code in separate RequireJS modules, to be served as static files and loaded
by the clients. Browsers may cache this files, reducing the network use. Functions in job 
definitions can be very brief, referencing to this modules for the rest of the logic.

### Client module

Starting with the folder `capataz_project` of our first example, we will create a subfolder called
`modules`. There we will place the file `job_module` with the following content:

```javascript
define([], function () {
	var exports = {};
	
	exports.jobFunction = function jobFunction(partition, numbers) {
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
		return { 
			partition: partition, 
			list0: list0, 
			list1: list1, 
			diff: sum 
		};
	}
	
	return exports;
});
```

This is the file that the clients will be loading separately. It is a standard RequireJS module 
definition, using the `define` function. The function in the second argument can be seen as the 
_constructor_ of the module. As it is recommended, the result of this function is an object 
(`exports`). In this case, it only has the `jobFunction` from the previous example.

### Updated main script

The new `main.js` script starts as it did before, except for one detail. The `customFiles` parameter
is added, pointing to the `modules` folder where the `job_module`. Capataz will serve all files in
said folder that do not clash with his routes.

```javascript
"use strict";
require('source-map-support').install();

var capataz = require('capataz'),
	base = capataz.dependencies.base,
	server = capataz.Capataz.run({
		port: 80,
		customFiles: './modules'
	});
```

The set of numbers could have been added to the module as well, but then it would be harder to 
experiment with different lists of numbers.

```javascript
var NUMBERS = [61, 83, 88, 94, 121, 281, 371, 486, 554, 734, 771, 854, 885, 1003];
```

The `jobs` generator has two major changes. First the former `jobFunction` definition is missing, 
since it has been moved to the RequireJS module. Clients are told to load this module by adding its 
name (or path) in the `imports` field. Imported modules will be passed as arguments to the job 
function, before the ones in `args`. Thats why the new `jobFunction` has an extra argument `m`, for 
the module.

```javascript
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
```

Jobs are scheduled in the same way as before. Yet more of them can be scheduled at once, since the 
new job definition is shorter than the one of the first example, and hence occupies less memory.

```javascript
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
	process.exit();
});
```

by [Leonardo Val](http://github.com/LeonardoVal).