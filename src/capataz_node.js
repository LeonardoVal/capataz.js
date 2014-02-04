/** Capataz definition for NodeJS when required as a module.
*/
"use strict";
var basis = require('./static/basis');

exports.Capataz = basis.declare({
	constructor: function Capataz(config) {
		basis.initialize(this, config)
		/** Capataz.workerCount=2:
			.
		*/
			.integer('workerCount', { defaultValue: 2, coerce: true })
		/** Capataz.maxRetries=50:
			.
		*/
			.number('maxRetries', { defaultValue: 50, coerce: true })
		/** Capataz.minDelay=100ms:
			Minimum delay between retries.
		*/
			.integer('minDelay', { defaultValue: 100, coerce: true })
		/** Capataz.maxDelay=120000ms (2 minutes):
			Maximum delay between retries.
		*/
			.number('maxDelay', { defaultValue: 2 * 60000 , coerce: true })
		/** Capataz.maxScheduled=5000:
			Maximum amount of scheduled pending jobs at any given time.
		*/
			.number('maxScheduled', { defaultValue: 5000, coerce: true })
		/** Capataz.desiredEvaluationTime=5000ms (5 seconds):
			Expected time the browsers must spend on each task.
		*/
			.number('desiredEvaluationTime', { defaultValue: 5000, coerce: true })
		/** Capataz.maxTaskSize=50:
			Maximum amount of jobs per task.
		*/
			.number('maxTaskSize', { defaultValue: 50, coerce: true })
		/** Capataz.statistics=new basis.Statistics():
			Statistics about the server functioning.
		*/
			.object('statistics', { defaultValue: new basis.Statistics() })
		/** Capataz.logger=basis.Logger.ROOT:
			Logger for the server.
		*/
			.object('logger', { defaultValue: basis.Logger.ROOT })
		/** Capataz.jobs:
			Scheduled jobs by id.
		*/
			.object('jobs', { defaultValue: {}});
		this.__pending__ = [];
		this.__jobCount__ = 0;
		this.__startTime__ = Date.now();
	},
	
	/** Capataz.wrappedJob(imports, fun, args):
		.
	*/
	wrappedJob: function wrappedJob(imports, fun, args) { 
		return ('(function(){' // A code template is not used because of minification.
			+'return basis.Future.imports.apply(this,'+ JSON.stringify(imports || []) +').then(function(deps){'
				+'return ('+ fun +').apply(this,deps.concat('+ JSON.stringify(args || []) +'));'
			+'});'
		+'})()');
	},
	
	/** Capataz.schedule(params):
		Schedules a new job. The params are the following:
		- fun: Either a function or a string with the Javascript code to 
		execute. It must always be a function.
		- imports: Array of dependencies to be loaded with RequireJS. These
		will be the first arguments in the call to the function in the code.
		- args: Further arguments to pass when the function in code is 
		called.
		- info: Description of the job to be displayed to the user.
		The result is a future that will be resolved when the job is 
		executed by a worker.
	*/
	schedule: function schedule(params) {
		var result = new basis.Future();
		if (this.scheduledJobsCount() >= this.maxScheduled) { 
			result.reject(new Error("Cannot schedule more jobs: the maximum amount ("+ 
				this.maxScheduled +") has been reached."));
		} else {
			var job = {
				id: (this.__jobCount__ = ++this.__jobCount__ & 0xFFFFFFFF).toString(36),
				info: ''+ params.info,
				code: this.wrappedJob(params.imports, params.fun, params.args),
				future: result,
				scheduledSince: Date.now(),
				assignedSince: -Infinity
			};
			this.jobs[job.id] = job;
			this.statistics.add('scheduled');
		}
		return result;
	},
	
	scheduledJobsCount: function scheduledJobsCount() {
		return Object.keys(this.jobs).length;
	},
	
	/** Capataz.nextTask():
		Builds a new task, with jobs taken from this.jobs in sequence until 
		there are no more jobs to perform.
	*/
	nextTask: function nextTask(amount) {
		amount = !isNaN(amount) ? +amount | 0 :
			Math.round(Math.max(1, Math.min(this.maxTaskSize,
				this.desiredEvaluationTime / Math.max(1, this.statistics.average(['evaluation_time','status:resolved']))
			)));
		if (this.__pending__.length < 1) { // Add new jobs to this.__pending__.
			this.__pending__ = Object.keys(this.jobs);
		}
		var ids = this.__pending__.splice(0, amount),
			capataz = this;
		this.statistics.add('task_size', ids.length);
		return { serverStartTime: this.__startTime__,
			jobs: basis.iterable(ids).map(function (id) {
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
	
	/** Capataz.processResult(post):
		Checks the posted result, and if it is valid, fulfils the 
		corresponding job.
	*/
	processResult: function processResult(post) {
		var id = post.id,
			job = this.jobs[id], status;
		delete this.jobs[id]; // Remove completed job.
		if (!job) { // Result's job id does not exist.
			this.logger.debug("Job ", post.id, " not found. Ignoring POST.");
			status = 'ignored';
		} else {
			if (isNaN(post.assignedSince) // Result has no assignedSince timestamp.
				|| post.assignedSince < this.__startTime__ // Result is outdated.
				|| post.assignedSince > Date.now() // Result was assigned in the future!
				|| post.time <= 0 // Result evaluation time is zero or negative!
				) {
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
		// Gather statistics.
		var keys = ['status:'+ status, 'platform:'+ post.clientPlatform, 'client:'+ post.postedFrom];
		this.statistics.add(['evaluation_time'].concat(keys), post.time);
		this.statistics.add(['roundtrip_time'].concat(keys), Date.now() - post.assignedSince);
	},
	
// Request handlers. ///////////////////////////////////////////////////////////
	
	/** Capataz.get_config(request, response):
		Serves the configuration for the clients. This is a JSON object with 
		parameters like the amount of retries and the delays between them.
	*/
	get_config: function serveConfig(request, response) {
		response.set("Cache-Control", "max-age=0,no-cache,no-store"); // Avoid cache.
		response.json({
			workerCount: this.workerCount,
			maxRetries: this.maxRetries,
			minDelay: this.minDelay,
			maxDelay: this.maxDelay
		});
	},
	
	/** Capataz.get_job(request, response):
		Serves a job to a client. This is a JSON object with the code to be 
		executed, the job's id, and other related data.
	*/
	get_job: function get_job(request, response) {
		var server = this,
			task = this.nextTask();
		if (task.jobs.length > 0) {
			response.set("Cache-Control", "max-age=0,no-cache,no-store"); // Avoid cache.
			response.json(task);
			this.statistics.add("jobs_per_serving", task.jobs.length);
		} else {
			this.logger.debug("There are no pending jobs yet.");
			response.send(404, "There are no pending jobs yet. Please try again later.");
		}
		return true;
	},
	
	/** Capataz.post_job(request, response):
		Processes a job's result posted by a client.
	*/
	post_job: function post_job(request, response) {
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
	
	/** Capataz.get_stats(request, response):
		Serves the current statistics of the server.
	*/
	get_stats: function get_stats(request, response) {
		response.set("Cache-Control", "max-age=0,no-cache,no-store");
		response.json(this.statistics);
	},
	
// ExpressJS related. //////////////////////////////////////////////////////////

	configureApp: function configureApp(args) {
		var express = require('express'),
			app = args.app || express();
		app.use(express.compress());
		app.use(express.bodyParser());
		if (args.staticPath) {
			app.use(express.static(args.staticPath));
		}
		app.get(args.jobPath || '/job', this.get_job.bind(this));
		app.post(args.jobPath || '/job', this.post_job.bind(this));
		app.get(args.statsPath || '/stats', this.get_stats.bind(this));
		app.get(args.configPath || '/config', this.get_config.bind(this));
		if (args.logFile) {
			this.logger.appendToFile(args.logFile);
		}
		return app;
	},
	
// Utilities. //////////////////////////////////////////////////////////////////

	scheduleAll: function scheduleAll(jobs, amount, callback) {
		var jobs_iter = basis.iterable(jobs).__iter__(),
			amount = isNaN(amount) ? this.maxScheduled : Math.min(+amount | 0, this.maxScheduled),
			capataz = this;
		return basis.Future.doWhile(function () {
			var partition = [],
				scheduled;
			try {
				for (var i = 0; i < amount; i++) {
					scheduled = capataz.schedule(jobs_iter());
					partition.push(scheduled);
					callback && callback(scheduled);
				}
			} catch (err) {
				basis.Iterable.prototype.catchStop(err);
			}
			// The Future.all() result is an array, so always casts to true.
			return partition.length < 1 ? false : basis.Future.all(partition);
		});
	}	
}); // declare Capataz.

//TODO if (require.main === module) { ...
