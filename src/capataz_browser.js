/** # Capataz client

Capataz module to run in a browser. It handles AJAX calls and manages the 
[web workers](http://www.w3schools.com/html/html5_webworkers.asp). All modules are handled via 
[RequireJS](http://requirejs.org/), that must be loaded before this file.
*/
require(['creatartis-base'], function (base) { "use strict";
	window.base = base;
	var APP = window.APP = {}, 
		LOGGER = APP.LOGGER = base.Logger.ROOT,
		CONFIG;

	/** ## Drudger #################################################################################
	
	The Drudger is a wrapper for the rendering thread's side of a web worker.
	*/
	APP.Drudger = base.declare({
		'static __count__': 0,
	
		constructor: function Drudger() {
			this.__number__ = Drudger.__count__++;
		},

		/** When a drudger starts it attempts to create and initialize his webworker. For this it
		uses the `capataz_worker.js` script on the server. If the browser does not support 
		webworkers, the drudger will execute the jobs in the rendering thread. This 
		[won't always work](http://stackoverflow.com/questions/18403448/how-to-prevent-stop-running-this-script-in-browsers),
		but may be necessary if the task must access APIs restricted to webworkers (like Canvas).
		
		The `useWebworkers` argument allows to express this requirements. If zero, jobs may be 
		executed in either webworkers or the rendering thread. If possitive, webworkers must be used 
		and an error will be raise if they are not supported. If negative, webworkers won't be used,
		and all jobs will be run in the rendering thread.
		*/
		initialize: function initialize(useWebworkers) {
			useWebworkers = useWebworkers|0;
			var ready = new base.Future();
			if (useWebworkers >= 0 && typeof Worker !== 'undefined') {
				this.webworker = new Worker('capataz_worker.js');
				this.webworker.onmessage = function (msg) {
					ready.resolve(msg.data || true);
				};
			} else if (useWebworkers > 0) {
				ready.reject("Webworkers are required but are not supported in this browser!");
			} else {
				ready.resolve(false);
			}
			return ready;
		},
		
		/** `onWorkerMessage` is the handler of results from the webworkers. All data exchange 
		between drudgers and their webworkers is done using JSON.
		*/
		onWorkerMessage: function onWorkerMessage(future, msg) {
			var data = JSON.parse(msg.data);
			if (data.hasOwnProperty('error')) {
				future.reject(data.error);
			} else if (data.hasOwnProperty('result')) {
				future.resolve(data.result);
			}
		},

	// ### Main workflow ###########################################################################

		/** Tasks (i.e. sets of jobs) are retrieved from the server at `CONFIG.jobURI`. If this 
		fails, the request is retried at most `CONFIG.maxRetries` times. In order not to overwhelm
		the server, there is a delay between retries. The first delay is `CONFIG.minDelay` 
		milliseconds, and with each subsequent retry it is doubled. Yet delays never get greater 
		than `CONFIG.maxDelay` milliseconds.
		*/
		getTask: function getTask() {
			var drudger = this;
			return base.Future.retrying(function () {
				LOGGER.info(drudger.__number__ +' < Requesting jobs.');
				return base.HttpRequest.getJSON(CONFIG.jobURI).then(function (task) {
					if (task.serverStartTime > CONFIG.startTime) {
						LOGGER.info(drudger.__number__ +' > Definitions are outdated. Reloading...');
						window.location.reload();
					}
					LOGGER.info(drudger.__number__ +' > Received '+ task.jobs.length +' jobs. E.g.: '+ task.jobs[0].info);
					return task;
				}, function (xhr) {
					LOGGER.warn(drudger.__number__ +' ! Job request failed (status: ', xhr.status, ' ',
						xhr.statusText, ' "', xhr.responseText, '")!');
					throw new Error('Job request failed!'); // So failure is not captured.
				});
			}, CONFIG.maxRetries, CONFIG.minDelay, 2, CONFIG.maxDelay).fail(function () {
				LOGGER.error(drudger.__number__ +' ! Job request failed too many times! Not retrying anymore.');
			});
		},
		
		/** Once a task has been retrieved, each of its jobs is done in a sequence. Each drudger
		takes on all the jobs of one task.
		*/
		doWork: function doWork(task) {
			var drudger = this;
			return base.Future.sequence(task.jobs, function (job) {
				job.clientPlatform = navigator.platform; // Set job's client properties.
				job.startedAt = Date.now();
				return drudger.doJob(job).then(function (result) { // Jobs finishes well.
					job.result = result; 
					job.time = Date.now() - job.startedAt;
					LOGGER.debug(drudger.__number__ +' > ', job.info, ' -> ', result);
					return job;
				}, function (error) { // Jobs finishes badly or aborts.
					job.error = error;
					job.time = Date.now() - job.startedAt;
					LOGGER.warn(drudger.__number__ +' > ', job.info, ' !! ', error);
					return job;
				});
			}).then(function () {
				return task;
			});
		},
		
		/** A job is done by sending it to the drudger's webworker. A future is returned so the 
		process can continue when the webworker yields back the results. 
		*/
		doJob: function doJob(job) {
			var drudger = this;
			if (this.webworker) {
				var future = new base.Future();
				this.webworker.onmessage = this.onWorkerMessage.bind(this, future);
				this.webworker.postMessage(JSON.stringify(job));
				return future;
			} else {
				/** If web workers are not available, the job is executed in the rendering thread. */
				return base.Future.invoke(eval, this, job.code);
			}
		},
		
		/** After all jobs of a task have been done (successfully or not), the results are posted to
		the server using the same URI where the task was obtained from.
		*/
		postResults: function postResults(task) {
			var drudger = this;
			return base.Future.retrying(function () {
				LOGGER.info(drudger.__number__ +" < Posting results.");
				return base.HttpRequest.postJSON(CONFIG.jobURI, task).fail(function (xhr) {
					LOGGER.warn(drudger.__number__ +' ! Posting failed: ', xhr.status, ' ', xhr.statusText, ' ', xhr.responseText, '.');
				});
			}, CONFIG.maxRetries, CONFIG.minDelay, 2, CONFIG.maxDelay).fail(function () {
				LOGGER.error(drudger.__number__ +' ! Job result post failed too many times! Not retrying anymore.');
			});
		},
		
		/** The `drudge` is the process of requesting a task, doing all her jobs, posting the 
		results and repeating it all again _ad infinitum_.
		*/
		drudge: function drudge() {
			var drudger = this;
			return base.Future.doWhile(function () {
				return drudger.getTask()
					.then(drudger.doWork.bind(drudger))
					.then(drudger.postResults.bind(drudger));
			}, function () { 
				return true; // Loop forever.
			}).fail(function (err) {
				LOGGER.error(drudger.__number__ +' Uncaught error on drudger! '+ err);
			});
		}
	}); // declare Drudger.
	
	// ## Client initialization ####################################################################

	APP.start = function start() {
		/** The clients parameters are taken first from the locations's query arguments. In this way
		the users can override the configuration sent by the server. */
		var args = {};
		window.location.search.substring(1).split('&').forEach(function (arg) {
			arg = arg.split('=').map(decodeURIComponent);
			if (arg.length == 2) {
				args[arg[0]] = arg[1];
			}
		});
		/** Then `config.json` is requested from the server. All parameters not specified in the
		query string are taken from this file. */
		return base.HttpRequest.getJSON(args.configURI || 'config.json').then(function (configJSON) {
			CONFIG = APP.CONFIG = base.copy(args, configJSON, { 
				/** If still parameters are missing, defaults values are assumed. */
				jobURI: 'task.json',
				workerCount: 2,
				adjustWorkerCount: true,
				maxRetries: 50,
				minDelay: 100, // 100 milliseconds.
				maxDelay: 2 * 60000, // 2 minutes.
				logLength: 30, // 30 lines.
			});
			/** Timestamp is used to compare with the server's. In case the server's is newer, a 
			reload is forced, since dependencies may be outdated. */
			CONFIG.startTime = Date.now(); 
			/** The logger is set up to show in the document, so the user can see it. */
			LOGGER.appendToHtml('log', CONFIG.logLength);
			/** As many drudgers are created and started as `CONFIG.workerCount`. */
			var workerCount = CONFIG.adjustWorkerCount && navigator.hardwareConcurrency ?
				navigator.hardwareConcurrency : CONFIG.workerCount;
			LOGGER.info('Starting '+ workerCount +' workers.');
			APP.drudgers = base.Iterable.range(workerCount).map(function () {
				return new APP.Drudger();
			}).toArray();
			return base.Future.sequence(APP.drudgers, function (drudger) {
				return drudger.initialize(CONFIG.useWebworkers)
					.done(drudger.drudge.bind(drudger));
			});
		});
	}; // APP.start().
	
	if (document.readyState === 'complete') {
		APP.start();
	} else {
		window.addEventListener('load', APP.start, false);
	}
}); // require base.