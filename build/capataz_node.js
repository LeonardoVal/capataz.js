/** # Server side module for [Node](http://nodejs.org)
*/
(function (exports) { "use strict";
	/** This module depends on [ExpressJS](http://expressjs.com/),
	[`creatartis-base`](https://github.com/LeonardoVal/creatartis-base) and others.
	*/
	var path = require('path'),
		filesystem = require('fs'),
		express = require('express'),
		base = require('creatartis-base'),
		Sermat = require('sermat');
	Sermat.modifiers.mode = Sermat.CIRCULAR_MODE;
	Sermat.include('Function');

	/** Dependencies are exported so they may be used by user code.
	*/
	exports.__package__ = 'capataz_node';
	exports.__name__ = 'capataz_node';
	exports.__dependencies__ = [express, base, Sermat];
	exports.__SERMAT__ = { include: [] };

	/** Import synonyms.
	*/
	var copy = base.copy,
		declare = base.declare,
		initialize = base.initialize,
		Text = base.Text,
		iterable = base.iterable,
		Iterable = base.Iterable,
		Future = base.Future,
		Logger = base.Logger,
		Statistics = base.Statistics;


/** # Capataz server ([Node](http://nodejs.org))

The Capataz constructor builds Capataz servers which can schedule jobs and assign them to connecting
browsers. It is based on a [ExpressJS](http://expressjs.com/) application.
*/
var bodyParser = require('body-parser'),
	favicon = require('serve-favicon');


var Capataz = exports.Capataz = declare({
	constructor: function Capataz(config) {
		/** The `config` property holds configuration options. Some will be shown to the clients,
		which may override them with URL's query arguments.

		The parameters that deal with the workload distribution are:
		*/
		initialize(this.config = {}, config)
		/** + `workerCount = 2` controls how many web workers the clients spawn. This may be changed
		by the browser (see `adjustWorkerCount`).
		*/
			.integer('workerCount', { defaultValue: 2, coerce: true })
		/** + `useWebworkers = 1` constraints the use of webworkers. If possitive (by default), all
		jobs must be run by webworkers. If negative, all jobs must be run by the rendering thread.
		Else, jobs can be run either way.
		*/
			.integer('useWebworkers', { defaultValue: 1, coerce: true })
		/** + `adjustWorkerCount = true` makes the client to set the `workerCount` to the value of
		[`navigator.hardwareConcurrency`](https://wiki.whatwg.org/wiki/Navigator_HW_Concurrency) if
		available.
		*/
			.bool('adjustWorkerCount', { defaultValue: true, coerce: true })
		/** + `maxRetries = 100` defines how many times the clients should retry failed
		connections to the server.
		*/
			.number('maxRetries', { defaultValue: 100, coerce: true })
		/** + `minDelay = 100ms` sets the minimum delay between retries.
		*/
			.integer('minDelay', { defaultValue: 100, coerce: true })
		/** + `maxDelay = 15m` sets the maximum delay between retries.
		*/
			.number('maxDelay', { defaultValue: 15 * 60000 , coerce: true })

		/** + `desiredEvaluationTime = 10s` defines the expected time the browsers must spend
		on each task. The server will bundle jobs if clients execute them faster than this value.
		*/
			.number('desiredEvaluationTime', { defaultValue: 10000, coerce: true })
		/** + `maxTaskSize = 50` is the maximum amount of jobs that can be bundled per task.
		*/
			.number('maxTaskSize', { defaultValue: 50, coerce: true })
		/** + `evaluationTimeGainFactor = 90%` is the gain factor used to adjust the
		evaluation time average.
		*/
			.number('evaluationTimeGainFactor', { defaultValue: 0.9, coerce: true })
		/** + `maxScheduled = 5000` is the maximum amount of scheduled pending jobs at any
		given time. Trying to schedule more jobs will raise an exception.
		*/
			.number('maxScheduled', { defaultValue: 5000, coerce: true })
		/** The parameters that deal with the [ExpressJS](http://expressjs.com/) server are:

			+ `port = 8080` is the port the server will listen to.
		*/
			.integer('port', { defaultValue: 8080, coerce: true })
		/** + `staticRoute = /capataz` is the URL from where static files are served.
		*/
			.string('staticRoute', { defaultValue: '/capataz' })
		/** + `serverFiles = <module_path>/static` is the path from where the static files of
		Capataz will be served.
		*/
			.string('serverFiles', { defaultValue: path.dirname(module.filename) +'/static' })
		/** + `customFiles = ''` is the path (or paths, separated by `'\n'`) from where custom
		static files will be served.
		*/
			.string('customFiles', { defaultValue: '' })
		/** + `routes = {}` is an object that may redefine the URLs of the Capataz verbs.
		*/
			.object('routes', { defaultValue: {} })
		/** + `authentication`: a function with signature `function (url, username, password)` to
			use for basic authentication.
		*/
			.func('authentication', { ignore: true })
		/** + `compression = true`: use GZIP compression or not.
		*/
			.bool('compression', { defaultValue: true, coerce: true })
		/** + `logFile = ./capataz-YYYYMMDD-HHNNSS.log`: file to write the server's log.
		*/
			.string('logFile', { defaultValue: Text.formatDate(new Date(), '"capataz-"yyyymmdd-hhnnss".log"') })
		;
		/** The rest of the constructor arguments set other server properties:
		*/
		initialize(this, config)
		/** + `statistics = new base.Statistics()` holds the statistics about the server functioning.
		*/
			.object('statistics', { defaultValue: new Statistics() })
		/** + `logger = base.Logger.ROOT` is the logger used by the server.
		*/
			.object('logger', { defaultValue: Logger.ROOT })
		/** + `store = new MemoryStore()` is the job store to use by the server.
		*/
			.object('store', { defaultValue: new MemoryStore(config) })
		;
		if (this.logger) {
			this.logger.appendToConsole();
			if (this.config.logFile) {
				this.logger.appendToFile(this.config.logFile);
			}
		}
		this.__startTime__ = Date.now();
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
		this.__accountServerStats__();
		if (!params.fun) {
			raise("Cannot schedule ", JSON.stringify(params), ", it has no `fun`!");
		}
		var job = this.store.store({
				info: params.info,
				imports: params.imports,
				args: params.args,
				fun: params.fun,
				tags: params.tags
			}).future;
		job.fail(this.logger.error.bind(this.logger));
		return job;
	},

	__accountServerStats__: function __accountServerStats__() {
		var stats = this.statistics,
			memoryUsage = process.memoryUsage();
		['rss', 'heapUsed', 'heapTotal'].forEach(function (t) {
			stats.add({key: 'memory', type: t}, memoryUsage[t]);
		});
	},

	/** The `taskSize` is calculated in order to force the clients to spend approximately the
	`desiredEvaluationTime`. In order to minimize network and compilation time clients must not
	spend too little nor too much time executing jobs.
	*/
	taskSize: function taskSize() {
		var statEJT = this.statistics.stat({ key: 'estimated_time' }),
			estimatedJobTime = Math.max(1, statEJT.average());
		return statEJT.count() <= 3 ? 1 : Math.round(Math.max(1,
			Math.min(this.config.maxTaskSize, this.config.desiredEvaluationTime / estimatedJobTime)
		));
	},

	/** The function `nextTask` builds a new task, which is a bundle of jobs sent to the client
	to be executed. If an `amount` is not given, one is calculated with `taskSize()`.
	*/
	nextTask: function nextTask(amount) {
		if (isNaN(amount)) { // If not given, estimate a good task size.
			amount = this.taskSize();
		}
		return {
			serverStartTime: this.__startTime__,
			jobs: this.store.task(amount).map(function (job) {
				return {
					id: job.id,
					info: (job.info || '') +'',
					imports: job.imports || [],
					args: job.args || [],
					fun: job.fun +'',
					assignedSince: Date.now()
				};
			})
		};
	},

	/** A post isn't valid when: it has no `assignedSince` timestamp, it was assigned before the
	server came online (it is outdated) or in the future, or it has a weird evaluation time (zero or
	less).
	*/
	postIsInvalid: function postIsInvalid(post) {
		return isNaN(post.assignedSince) || // Result has no assignedSince timestamp.
			post.assignedSince < this.__startTime__ || // Result is outdated.
			post.assignedSince > Date.now() || // Result was assigned in the future!
			post.time <= 0 // Result evaluation time is zero or negative!
		;
	},

	/** When all jobs in a task have been completed, the clients post the results back to the
	server. The function `processResult(post)` checks the posted result, and if it is valid, fulfils
	the corresponding jobs.
	*/
	processResult: function processResult(post) {
		this.__accountServerStats__();
		var job = this.store.assigned(post.id),
			status;
		if (!job) { // Result's job id does not exist.
			this.logger.debug("Job ", post.id, " not found. Ignoring POST.");
			status = 'ignored';
		} else if (this.postIsInvalid(post)) {
			this.logger.warn("Posted result for ", post.id, " is not valid. Ignoring POST.");
			status = 'invalid';
		} else if (typeof post.error !== 'undefined') { // Fulfil the job's future.
			status = 'rejected';
			job.future.reject(post.error);
		} else {
			status = 'resolved';
			job.future.resolve(post.result);
		}
		if (job) {
			this.accountPost(post, job, status);
		}
	},

	/** Gathers statistics about completed jobs. Some are used in the server's own operation.
	*/
	accountPost: function accountPost(post, job, status) {
		if (status === 'resolved') {
			this.statistics.gain({key: 'estimated_time'}, post.time,
				this.config.evaluationTimeGainFactor);
		}
		this.statistics.add(copy({key: 'evaluation_time', status: status,
			platform: post.clientPlatform, client: post.postedFrom,
		}, job && job.tags), post.time);
		this.statistics.add(copy({key: 'roundtrip_time', status: status,
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
			jobURI: this.config.taskRoute,
			workerCount: this.config.workerCount,
			adjustWorkerCount: this.config.adjustWorkerCount,
			maxRetries: this.config.maxRetries,
			minDelay: this.config.minDelay,
			maxDelay: this.config.maxDelay,
			useWebworkers: this.config.useWebworkers
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

	/** The clients can get the server's store status via a `GET` to `/store.json`. This is handled
	by `get_store(request, response)`.
	*/
	get_store: function get_store(request, response) {
		response.set("Cache-Control", "max-age=0,no-cache,no-store");
		response.json(this.store.status());
	},

	// ## ExpressJS. ###############################################################################

	/** The Capataz server relays on a [ExpressJS](http://expressjs.com/) application. The method
	`configureApp(app)` configures the given ExpressJS app, or a new one if none is provided.
	Configuration includes setting up the routes (including static files), JSON parsing, compression
	and (of course) the method handlers.
	*/
	configureApp: function configureApp(app) {
		var config = this.config;
		app = app || express();
		app.use(bodyParser.json()); // Enable JSON parsing.
		if (config.compression) {
			app.use(require('compression')());
		}
		app.use(favicon(config.serverFiles +'/favicon.ico'));
		
		var staticRoute = config.staticRoute;
		app.get('/', function(req, res) { // Redirect the root to <staticRoute/index.html>.
			res.redirect(staticRoute +'/index.html');
		});
		app.get(config.routes.task || staticRoute +'/task.json', this.get_task.bind(this)); // REST API.
		app.post(config.routes.task || staticRoute +'/task.json', this.post_task.bind(this));
		app.get(config.routes.config || staticRoute +'/config.json', this.get_config.bind(this));
		app.get(config.routes.stats || staticRoute +'/stats.json', this.get_stats.bind(this));
		app.get(config.routes.store || staticRoute +'/store.json', this.get_store.bind(this));
		if (typeof config.authentication === 'function') {
			[staticRoute, config.taskRoute, config.configRoute, config.statsRoute].forEach(function (route) {
				app.use(route, express.basicAuth(config.authentication.bind(this, route)));
			});
		}
		app.use(staticRoute, express.static(config.serverFiles)); // Static files.
		config.customFiles.split('\n').forEach(function (path) {
			path = path.trim();
			if (path) {
				app.use(staticRoute, express.static(path));
			}
		});
		return app;
	},

	/** `Capataz.run` is a shortcut to quickly configure and start a Capataz server. The `config`
	argument may include an ExpressJS `app` to use.
	*/
	'static run': function run(config) {
		var capataz = new Capataz(config),
			port = capataz.config.port;
		capataz.logger.info('Setting up the Capataz server.');
		capataz.expressApp = capataz.configureApp(config.app);
		capataz.expressApp.listen(port);
		capataz.logger.info('Server started and listening at port ', port, '.');
		return capataz;
	},

	// ## Utilities. ###############################################################################

	/** Many times the amount of jobs is too big for the server to schedule all at once. The
	function `scheduleAll()` takes a job generator (`jobs`). It will take an `amount` of jobs from
	the generator and schedule them, and wait for them to finish before proceeding to the next jobs.
	In this way all jobs can be handled without throttling the server. The `callback` is called for
	every job actually scheduled with the resulting `Future`.
	*/
	scheduleAll: function scheduleAll(jobs, amount, callback) {
		var jobs_iter = iterable(jobs).__iter__(),
			capataz = this;
		amount = isNaN(amount) ? this.config.maxScheduled : Math.min(+amount | 0, this.config.maxScheduled);
		return Future.doWhile(function () {
			var partition = [],
				scheduled;
			try {
				for (var i = 0; i < amount; ++i) {
					scheduled = capataz.schedule(jobs_iter());
					partition.push(callback ? callback(scheduled) : scheduled);
				}
			} catch (err) {
				Iterable.prototype.catchStop(err);
			}

			return partition.length < 1 ? false : Future.all(partition);
		} /* Future.all() result is an array, hence always truthy. */ );
	}
}); // declare Capataz.


/** # Stores

Job stores are components dedicated to store the scheduled jobs and (possibly) its results.

## Base store ######################################################################################
*/
var Store = exports.Store = declare({
	/** All constructors of job stores can have the following parameters:
	*/
	constructor: function Store(config) {
		initialize(this, config)
			/** + `maxScheduled=5000` is the maximum amount of scheduled pending jobs at any given
			time. Trying to schedule more jobs will raise an exception.
			*/
			.number('maxScheduled', { defaultValue: 5000, coerce: true })
			/** + `statistics` is a `base.Statistics` object that may be used to register data about
			the store.
			*/
			.object('statistics', { ignore: true });
		this.__count__ = 0;
	},
	
	/** When a job is stored its object is extended with the following:
	+ a `future` to represent its asynchronous execution,
	+ an `id` string to identify it,
	+ many timestamps: `scheduledSince`, `assignedSince`, `resolvedSince` and `rejectedSince`.
	
	If the `maxScheduled` number of jobs is exceeded, an error is raised. 
	
	Warning! The default implementation does not store the object. This method must be overriden.
	*/
	store: function (job) {
		base.raiseIf(Object.keys(this.__pending__).length >= this.maxScheduled,
			"Cannot schedule more jobs: the maximum amount (", this.maxScheduled, ") has been reached!");
		job.id = (this.__count__ = (this.__count__ + 1) & 0x7FFFFFFF); // Cycles after approx. 2.14e9 jobs.
		job.future = new Future();
		job.scheduledSince = Date.now();
		job.assignedSince = Infinity;
		job.resolvedSince = Infinity;
		job.rejectedSince = Infinity;
		if (this.statistics) {
			this.statistics.add(copy({key: 'scheduled'}, job.tags));
		}
		return job;
	},
	
	/** The `task` method retrieves a given `amount` of pending (or assigned) jobs. */
	task: base.objects.unimplemented('Store', 'task'),
	
	/** The `assigned` method obtains an assigned job by `id`.
	*/
	assigned: base.objects.unimplemented('Store', 'assigned'),
	
	/** The `status` method returns a representation of the status of this store that is 
	serializable in JSON.
	*/
	status: base.objects.unimplemented('Store', 'store'),
	
	/** The `onJobResolve` handler adds to the job definition its `result` and updates the 
	`resolvedSince` timestamp.
	*/
	onJobResolve: function (job, value) {
		job.result = value;
		job.resolvedSince = Date.now();
	},
	
	/** The `onJobReject` handler adds to the job definition its `error` and updates the 
	`rejectedSince` timestamp.
	*/
	onJobReject: function (job, reason) {
		job.error = reason;
		job.rejectedSince = Date.now();
	},
	
	// ### Utilities ###############################################################################
	
	/** Method `__take__` can be used to select `n` keys from object `obj`. If `deleteTaken` is true
	the keys are deleted from the object. The result is an array of `[key, value]` pairs.
	*/
	__take__: function __take__(obj, n, deleteTaken) {
		var selected = [];
		for (var id in obj) if (obj.hasOwnProperty(id)) {
			if (--n < 0) {
				break;
			}
			selected.push([id, obj[id]]);
			if (deleteTaken) {
				delete obj[id];
			}			
		}
		return selected;
	}
}); // declare Store

/** ## Memory store ################################################################################

This is the default store, which keeps all jobs in memory.
*/
var MemoryStore = exports.MemoryStore = declare(Store, {
	/** The constructor of a memory store can have also the following parameters:
	*/
	constructor: function MemoryStore(config) {
		Store.call(this, config); // Super-constructor call.
		initialize(this, config)
			/** + `keepResolved=false` defines if successful jobs are kept in memory.
			*/
			.bool('keepResolved', { defaultValue: false, coerce: true })
			/** + `keepRejected=false` defines if failed jobs are kept in memory.
			*/
			.bool('keepRejected', { defaultValue: false, coerce: true });
		this.__pending__ = {};
		this.__assigned__ = {};
		if (this.keepResolved) {
			this.__resolved__ = {};
		}
		if (this.keepRejected) {
			this.__rejected__ = {};
		}
	},
	
	/** Stored jobs are put as members of the `__pending__` object. Also the job's future is bound
	to the `onJobResolve` and `onJobReject` handlers (see below).
	*/
	store: function (job) {
		job = Store.prototype.store.call(this, job);
		job.future.done(this.onJobResolve.bind(this, job));
		job.future.fail(this.onJobReject.bind(this, job));
		this.__pending__[job.id] = job;
		return job;
	},
	
	/** The `task` method tries to return an array of `amount` jobs. Firstly they are fetched from
	`__pending__`, but if there are not enough some jobs from `__assigned__` are used too.
	*/
	task: function task(amount) {
		var store = this,
			selected = this.__take__(this.__pending__, amount, true).map(function (pair) {
				var id = pair[0], job = pair[1];
				store.__assigned__[id] = job;
				job.assignedSince = Date.now();
				return job;
			});
		if (selected.length < amount) {
			selected = selected.concat(this.__take__(this.__assigned__, amount - selected.length).map(function (pair) {
				return pair[1]; // job.
			}));
		}
		return selected;
	}, 

	/** The `assigned` method obtains an assigned job by `id`.
	*/
	assigned: function assigned(id) {
		return this.__assigned__[id];
	},
	
	/** The `status` of a memory stores details the ids for pending, assigned, resolved and rejected
	jobs (if applies).
	*/
	status: function status() {
		var result = {
			count: this.__count__,
			pending: Object.keys(this.__pending__),
			assigned: Object.keys(this.__assigned__)
		};
		if (this.__resolved__) {
			result.resolved = Object.keys(this.__resolved__);
		}
		if (this.__rejected__) {
			result.rejected = Object.keys(this.__rejected__);
		}
		return result;
	},
	
	/** The `onJobResolve` handler removes the job from `__assigned__`, and if `keepResolved` is 
	true puts the job in `__resolved__`.
	*/
	onJobResolve: function (job, value) {
		if (this.__assigned__.hasOwnProperty(job.id)) {
			delete this.__assigned__[job.id];
			Store.prototype.onJobResolve.call(this, job, value);
			if (this.keepResolved) {
				this.__resolved__[job.id] = job;
			}
		}
	},
	
	/** The `onJobReject` handler removes the job from `__assigned__`, and if `keepRejected` is 
	true puts the job in `__rejected__`.
	*/
	onJobReject: function (job, reason) {
		if (this.__assigned__.hasOwnProperty(job.id)) {
			delete this.__assigned__[job.id];
			Store.prototype.onJobReject.call(this, job, reason);
			if (this.keepRejected) {
				this.__rejected__[job.id] = job;
			}
		}
	}
}); // declare MemoryStore

/** ## File store ##################################################################################

This is a job store that uses the file system to decrease the amount of memory used.
*/
var FileStore = exports.FileStore = declare(Store, {
	/** The constructor of a file store can also have the following parameters:
	*/
	constructor: function FileStore(config) {
		Store.call(this, config); // Super-constructor call.
		initialize(this, config)
			/** + `storeFileFolder=./tmp` is the path of the folder for the job files.
			*/
			.string('storeFileFolder', { defaultValue: './tmp', coerce: true });
		this.__count__ = 0;
		this.__pending__ = {};
		this.__assigned__ = {};
	},
	
	/** All jobs are stored in the `storeFileFolder` as JSON files (with UTF8 encoding). The job's 
	Future object is excluded because it cannot be properly serialized.
	*/
	jobFilePath: function jobFilePath(id) {
		return this.storeFileFolder+ "/job-"+ Text.lpad((+id) +'', 10, '0') +".json";
	},
	
	readJob: function readJob(id, future) {
		var filePath = this.jobFilePath(id),
			fileContent = filesystem.readFileSync(filePath, { encoding: 'utf8' }),
			job = JSON.parse(fileContent);
		job.future = future;
		return job;
	},
	
	writeJob: function writeJob(job) {
		var filePath = this.jobFilePath(job.id),
			fileContent = JSON.stringify(copy({future: undefined}, job), null, '\t'); // Futures cannot be serialized.
		filesystem.writeFileSync(filePath, fileContent, { encoding: 'utf8' });
		return filePath;
	},
	
	/** When storing a job, its file is written and its `id` and `future` remain in memory.
	*/
	store: function store(job) {
		job = Store.prototype.store.call(this, job);
		this.writeJob(job);
		this.__pending__[job.id] = job.future;
		job.future.done(this.onJobResolve.bind(this, job.id));
		job.future.fail(this.onJobReject.bind(this, job.id));
		return job;
	},
	
	/** Assembling a task is similar to the memory store, except that the jobs definitions have to
	be read from files.
	*/
	task: function task(amount) {
		var store = this,
			selected = this.__take__(this.__pending__, amount, true).map(function (pair) {
				var id = pair[0], future = pair[1], job = store.readJob(id, future);
				store.__assigned__[id] = future;
				job.assignedSince = Date.now();
				store.writeJob(job);
				return job;
			});
		if (selected.length < amount) {
			selected = selected.concat(this.__take__(this.__assigned__, amount - selected.length).map(function (pair) {
				return store.readJob(pair[0], pair[1]);
			}));
		}
		return selected;
	},
	
	/** Getting an assigned job implies reading its file.
	*/
	assigned: function assigned(id) {
		var future = this.__assigned__[id];
		return future ? this.readJob(id, future) : undefined;
	},
	
	/** The `status` of a memory stores details the ids for pending, assigned, resolved and rejected
	jobs (if applies).
	*/
	status: function status() {
		return {
			count: this.__count__,
			pending: Object.keys(this.__pending__),
			assigned: Object.keys(this.__assigned__)
		};
	},
	
	/** The `onJobResolve` handler updates the job's file with the `result`, and removes the job's 
	entry from memory.
	*/
	onJobResolve: function (id, value) {
		if (this.__assigned__[id]) {
			var future = this.__assigned__[id];
			delete this.__assigned__[id];
			var job = this.readJob(id, future);
			Store.prototype.onJobResolve.call(this, job, value);
			this.writeJob(job);
		}
	},
	
	/** The `onJobReject` handler updates the job's file with the `error`, and removes the job's 
	entry from memory.
	*/
	onJobReject: function (id, reason) {
		if (this.__assigned__[id]) {
			var future = this.__assigned__[id];
			delete this.__assigned__[id];
			var job = this.readJob(id, future);
			Store.prototype.onJobReject.call(this, job, reason);
			this.writeJob(job);
		}
	}
}); // declare FileStore

})(exports);
//TODO if (require.main === module) { ...
//# sourceMappingURL=capataz_node.js.map