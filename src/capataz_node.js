/** # Capataz server ([Node](http://nodejs.org))

This module defines the Capataz class. It represents a Capataz server which can schedule jobs and 
assign them to connecting browsers. It is based on a [ExpressJS](http://expressjs.com/) application.
*/
"use strict";
var base = require('creatartis-base'),
	path = require('path');

exports.Capataz = base.declare({
	constructor: function Capataz(config) {
		/** The `config` property holds configuration options. Some will be shown to the clients. 
		The clients may override this values with URL's query arguments.
		*/
		base.initialize(this.config = {}, config)
		/** + `config.workerCount=2` controls how many web workers the clients spawn.
		*/
			.integer('workerCount', { defaultValue: 2, coerce: true })
		/** + `config.maxRetries = 50` defines how many times the clients should retry failed 
		connections to the server.
		*/
			.number('maxRetries', { defaultValue: 50, coerce: true })
		/** + `config.minDelay = 100ms` sets the minimum delay between retries.
		*/
			.integer('minDelay', { defaultValue: 100, coerce: true })
		/** + `config.maxDelay = 2m` sets the maximum delay between retries.
		*/
			.number('maxDelay', { defaultValue: 2 * 60000 , coerce: true })
		/** + `config.desiredEvaluationTime=10s` defines the expected time the browsers must spend 
		on each task. The server will bundle jobs if clients execute them faster than this value.
		*/
			.number('desiredEvaluationTime', { defaultValue: 10000, coerce: true })
		/** + `config.maxTaskSize=50` is the maximum amount of jobs that can be bundled per task.
		*/
			.number('maxTaskSize', { defaultValue: 50, coerce: true })
		/** + `config.evaluationTimeGainFactor=0.9` is the gain factor used to adjust the evaluation
		time average.		
		*/
			.number('evaluationTimeGainFactor', { defaultValue: 0.9, coerce: true })
		/** + `config.maxScheduled=5000` is the maximum amount of scheduled pending jobs at any 
		given time. Trying to schedule more jobs will raise an exception.
		*/
			.number('maxScheduled', { defaultValue: 5000, coerce: true });
		/** The rest of the constructor arguments set other server properties.
		*/
		base.initialize(this, config)
		/** + `statistics=new base.Statistics()` holds the statistics about the server functioning.
		*/
			.object('statistics', { defaultValue: new base.Statistics() })
		/** + `logger=base.Logger.ROOT` is the logger used by the server.
		*/
			.object('logger', { defaultValue: base.Logger.ROOT })
		/** + `jobs={}` is a map of scheduled jobs by id.
		*/
			.object('jobs', { defaultValue: {}});
		this.__pending__ = [];
		this.__jobCount__ = 0;
		this.__startTime__ = Date.now();
	},
	
	/** Jobs sent to the clients are JSON objects. Their most important data is the javascript code 
	that must be executed by the clients. The code to be managed by the Capataz server must be a 
	function. This is wrapped in another function that handles dependencies (using 
	[requirejs](http://requirejs.org/)) and the call's arguments.
	*/
	wrappedJob: function wrappedJob(imports, fun, args) {
		return ('(function(){' // A code template is not used because of minification.
			+'return base.Future.imports.apply(this,'+ JSON.stringify(imports || []) +').then(function(deps){'
				+'return ('+ fun +').apply(this,deps.concat('+ JSON.stringify(args || []) +'));'
			+'});'
		+'})()');
	},
	
	/** To schedule a new job the following data must be provided (in `params`):
	
		+ `fun`: Either a function or a string with the Javascript code of a function.
		+ `imports`: Array of dependencies to be loaded with [requirejs](http://requirejs.org/).
			These will be the first arguments in the call to `fun`.
		+ `args`: Further arguments to pass to `fun`, after the dependencies.
		+ `info`: Description of the job to be displayed to the user. 
		
	The result of a call to `schedule` is a future that will be resolved when the job is executed by
	a worker client.
	*/
	schedule: function schedule(params) {
		var result = new base.Future();
		if (this.scheduledJobsCount() >= this.config.maxScheduled) { 
			result.reject(new Error("Cannot schedule more jobs: the maximum amount ("+ 
				this.config.maxScheduled +") has been reached."));
		} else {
			var job = {
				id: (this.__jobCount__ = ++this.__jobCount__ & 0xFFFFFFFF).toString(36),
				info: ''+ params.info,
				code: this.wrappedJob(params.imports, params.fun, params.args),
				future: result,
				scheduledSince: Date.now(),
				assignedSince: -Infinity
			};
			if (params.tags) {
				job.tags = params.tags;
			}
			this.jobs[job.id] = job;
			this.statistics.add(base.copy({key: 'scheduled'}, params.tags));
		}
		return result;
	},
	
	scheduledJobsCount: function scheduledJobsCount() {
		return Object.keys(this.jobs).length;
	},
	
	
	taskSize: function taskSize() {
		var estimatedJobTime = Math.max(1, this.statistics.average({key:'estimated_time'}));
		return Math.round(Math.max(1, Math.min(this.config.maxTaskSize,
			this.config.desiredEvaluationTime / estimatedJobTime
		)));
	},
	
	/** The function `nextTask()` builds a new task, with jobs taken from `this.jobs` in sequence 
	until there are no more jobs to perform. A task is a bundle of jobs sent to the client to be 
	executed.
	*/
	nextTask: function nextTask(amount) {
		amount = isNaN(amount) ? this.taskSize() : +amount | 0;
		if (this.__pending__.length < 1) { // Add new jobs to this.__pending__.
			this.__pending__ = Object.keys(this.jobs);
		}
		var ids = this.__pending__.splice(0, amount),
			capataz = this;
		return { serverStartTime: this.__startTime__,
			jobs: base.iterable(ids).map(function (id) {
				var job = capataz.jobs[id];
				return job && {
					id: id,
					info: job.info,
					code: job.code,
					assignedSince: Date.now()
				};
			}).filter().toArray() // This is done because of asynchronous job resolution.
		};
	},
	
	/** A post isn't valid when: it has no `assignedSince` timestamp, it was assigned before the 
	server came online (it is outdated) or in the future, or it has a weird evaluation time (zero or
	less).
	*/
	postIsInvalid: function postIsInvalid(post) {
		return isNaN(post.assignedSince) // Result has no assignedSince timestamp.
			|| post.assignedSince < this.__startTime__ // Result is outdated.
			|| post.assignedSince > Date.now() // Result was assigned in the future!
			|| post.time <= 0 // Result evaluation time is zero or negative!
		;
	},
	
	/** When all jobs in a task have been completed, the clients post the results back to the 
	server. The function `processResult(post)` checks the posted result, and if it is valid, fulfils 
	the corresponding jobs.
	*/
	processResult: function processResult(post) {
		var id = post.id,
			job = this.jobs[id], status;
		delete this.jobs[id]; // Remove completed job.
		if (!job) { // Result's job id does not exist.
			this.logger.debug("Job ", post.id, " not found. Ignoring POST.");
			status = 'ignored';
		} else {
			if (this.postIsInvalid(post)) {
				this.logger.warn("Posted result for ", id, " is not valid. Ignoring POST.");
				this.jobs[id] = job; // Put the job back.
				status = 'invalid';
			} else { // Fulfil the job's future.
				if (typeof post.error !== 'undefined') {
					status = 'rejected';
					job.future.reject(post.error);
				} else {
					status = 'resolved';
					job.future.resolve(post.result);
				}
			}
		}
		this.accountPost(post, job, status);
	},
	
	/** Gathers statistics about completed jobs. Some are used in the server's own operation.
	*/
	accountPost: function accountPost(post, job, status) {
		if (status == 'resolved') {
			this.statistics.gain({key: 'estimated_time'}, post.time, 
				this.config.evaluationTimeGainFactor);
		}
		this.statistics.add(base.copy({key: 'evaluation_time', status: status,
			platform: post.clientPlatform, client: post.postedFrom,
		}, job && job.tags), post.time);
		this.statistics.add(base.copy({key: 'roundtrip_time', status: status, 
			platform: post.clientPlatform, client: post.postedFrom
		}, job && job.tags), Date.now() - post.assignedSince);
	},
	
	// ## Request handlers. ########################################################################
	
	/** The clients fetch their configuration via a `GET` to `/config.json`. This is handled by 
	`get_config(request, response)`. The client's configuration is a JSON object with parameters 
	like the amount of retries and the delays between them.
	*/
	get_config: function serveConfig(request, response) {
		response.set("Cache-Control", "max-age=0,no-cache,no-store"); // Avoid cache.
		response.json({
			workerCount: this.config.workerCount,
			maxRetries: this.config.maxRetries,
			minDelay: this.config.minDelay,
			maxDelay: this.config.maxDelay
		});
	},
	
	/** The clients fetch a new task via a `GET` to `/task.json`. This is handled by 
	`get_task(request, response)`. A task is a JSON object with one or more jobs; each including the 
	code to be executed, the job's id, and other related data.
	*/
	get_task: function get_task(request, response) {
		var server = this,
			task = this.nextTask();
		if (task.jobs.length > 0) {
			response.set("Cache-Control", "max-age=0,no-cache,no-store"); // Avoid cache.
			response.json(task);
			this.statistics.add({key:"jobs_per_task"}, task.jobs.length);
		} else {
			this.logger.debug("There are no pending jobs yet.");
			response.send(404, "There are no pending jobs yet. Please try again later.");
		}
		return true;
	},
	
	/** The clients report a task's results via a `POST` to `/task.json`. This is handled by 
	`post_task(request, response)`.
	*/
	post_task: function post_task(request, response) {
		var capataz = this,
			postedFrom = request.connection.remoteAddress +'';
		if (!request.body || !Array.isArray(request.body.jobs)) {
			response.send(400, "Invalid post.");
		} else {
			response.send("Thank you.");
			request.body.jobs.forEach(function (job) {
				job.postedFrom = postedFrom;
				capataz.processResult(job);
			});
		}
	},
	
	/** The clients can get the server's statistics via a `GET` to `/stats.json`. This is handled by
	`get_stats(request, response)`.
	*/
	get_stats: function get_stats(request, response) {
		response.set("Cache-Control", "max-age=0,no-cache,no-store");
		response.json(this.statistics);
	},
	
	// ## ExpressJS. ###############################################################################

	/** The Capataz server relays on a [ExpressJS](http://expressjs.com/) application. The method 
	`configureApp(args)` sets up the server, including serving static files, JSON parsing, 
	compression and (of course) the method handlers.
	
	The `args` may include:
	*/
	configureApp: function configureApp(args) {
		args = base.copy({}, args, {
			staticPath: path.dirname(module.filename) +'/static',
			taskPath: '/task.json',
			statsPath: '/stats.json',
			configPath: '/config.json'
		});
		var express = args.express || require('express'),
			app = args.app || express();
		/** + `disableCompression = false`: compression is enabled by default.
		*/
		if (!args.disableCompression) {
			app.use(express.compress());
		}
		/** + `staticPath = <module_path>/static`: folder path from which to serve the static files 
		(js, html, etc) required by the clients. If it is present but falsy, no static handler is defined.
		*/
		if (args.staticPath) {
			app.use(express.static(args.staticPath));
		}
		app.use(express.json()); // Enable JSON parsing.
		/** + `taskPath = /task.json`: path for getting tasks and posting results.
		*/
		app.get(args.taskPath, this.get_task.bind(this));
		app.post(args.taskPath, this.post_task.bind(this));
		/** + `configPath = /config.json`: path for getting the clients' configuration.
		*/
		app.get(args.configPath, this.get_config.bind(this));
		/** + `statsPath = /stats.json`: path for getting the server's statistics.
		*/
		app.get(args.statsPath, this.get_stats.bind(this));
		/** + `authentication`: a function with signature `function (url, username, password)` to 
			use for basic authentication.
		*/
		if (typeof args.authentication === 'function') {
			app.use(args.taskPath, express.basicAuth(args.authentication.bind(this, args.taskPath)));
			app.use(args.configPath, express.basicAuth(args.authentication.bind(this, args.configPath)));
			app.use(args.statsPath, express.basicAuth(args.authentication.bind(this, args.statsPath)));
			app.use(express.basicAuth(args.authentication.bind(this, '')));
		}
		/** + `logFile`: file to write the server's log.
		*/
		if (args.logFile) {
			this.logger.appendToFile(args.logFile);
		}
		return app;
	},
	
	// ## Utilities. ###############################################################################

	/** Many times the amount of jobs is too big for the server to schedule all at once. The 
	function `scheduleAll()` takes an job generator (`jobs`). It will take an `amount` of jobs from 
	the generator and schedule them, and wait for them to finish before proceeding to the next jobs.
	In this way all jobs can be handled without throttling the server. The `callback` is called for
	every job actually scheduled with the resulting `Future`.
	*/
	scheduleAll: function scheduleAll(jobs, amount, callback) {
		var jobs_iter = base.iterable(jobs).__iter__(),
			amount = isNaN(amount) ? this.config.maxScheduled : 
				Math.min(+amount | 0, this.config.maxScheduled),
			capataz = this;
		return base.Future.doWhile(function () {
			var partition = [],
				scheduled;
			try {
				for (var i = 0; i < amount; ++i) {
					scheduled = capataz.schedule(jobs_iter());
					partition.push(callback ? callback(scheduled) : scheduled);
				}
			} catch (err) {
				base.Iterable.prototype.catchStop(err);
			}
			
			return partition.length < 1 ? false : base.Future.all(partition);
		} /* Future.all() result is an array, hence always truthy. */ );
	}	
}); // declare Capataz.

//TODO if (require.main === module) { ...
