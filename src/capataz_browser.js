/** # Capataz client

Capataz module to run in a browser. It handles AJAX calls and manages the 
[web workers](http://www.w3schools.com/html/html5_webworkers.asp). All modules
are handled via [RequireJS](http://requirejs.org/), that must be loaded before
this file.
*/
require(['creatartis-base'], function (base) { "use strict";
	window.base = base;
	var APP = window.APP = {}, 
		LOGGER = APP.LOGGER = base.Logger.ROOT,
		CONFIG;

	/** APP.Drudger():
		A wrapper for the rendering thread's side of a web worker.
	*/
	APP.Drudger = base.declare({ //////////////////////////////////////////////
		constructor: function Drudger() {
			// Nothing for now.
		},

		initialize: function initialize() {
			var ready = new base.Future();
			if (typeof Worker === 'function') {
				this.webworker = new Worker('capataz_worker.js');
				this.webworker.onmessage = function (msg) {
					ready.resolve(msg.data || true);
				};
			} else {
				ready.resolve(false);
			}
			return ready;
		},
		
		onWorkerMessage: function onWorkerMessage(future, msg) {
			var data = JSON.parse(msg.data);
			if (data.hasOwnProperty('error')) {
				future.reject(data.error);
			} else if (data.hasOwnProperty('result')) {
				future.resolve(data.result);
			}
		},

	// Main workflow. //////////////////////////////////////////////////////////

		getTask: function getTask() {
			return base.Future.retrying(function () {
				LOGGER.info('< Requesting jobs.');
				return base.HttpRequest.getJSON(CONFIG.jobURI).then(function (task) {
					if (task.serverStartTime > CONFIG.startTime) {
						LOGGER.info('> Definitions are outdated. Reloading...');
						window.location.reload();
					}
					LOGGER.info('> Received '+ task.jobs.length +' jobs. E.g.: '+ task.jobs[0].info);
					return task;
				}, function (xhr) {
					LOGGER.warn('! Job request failed: ', xhr.status, ' ', 	xhr.statusText, ': ', xhr.responseText, '');
					throw new Error('Job request failed!'); // So failure is not captured.
				});
			}, CONFIG.maxRetries, CONFIG.minDelay, 2, CONFIG.maxDelay).fail(function () {
				LOGGER.error('Job request failed too many times. Not retrying anymore.');
			});
		},
		
		doJob: function doJob(job) {
			var drudger = this;
			if (this.webworker) {
				var future = new base.Future();
				this.webworker.onmessage = this.onWorkerMessage.bind(this, future);
				this.webworker.postMessage(JSON.stringify(job));
				return future;
			} else {
				// If web workers are not available, execute in the rendering thread.
				return base.Future.invoke(eval, this, job.code);
			}
		},
		
		doWork: function doWork(task) {
			var drudger = this;
			return base.Future.sequence(task.jobs, function (job) {
				job.clientPlatform = navigator.platform; // Set job's client properties.
				job.startedAt = Date.now();
				return drudger.doJob(job).then(function (result) { // Jobs finishes well.
					job.result = result; 
					job.time = Date.now() - job.startedAt;
					LOGGER.debug('> ', job.info, ' -> ', result);
					return job;
				}, function (error) { // Jobs finishes badly or aborts.
					job.error = error;
					job.time = Date.now() - job.startedAt;
					LOGGER.warn('> ', job.info, ' !! ', error);
					return job;
				});
			}).then(function () {
				return task;
			});
		},
		
		postResults: function postResults(task) {
			return base.Future.retrying(function () {
				LOGGER.info("< Posting results.");
				return base.HttpRequest.postJSON(CONFIG.jobURI, task).fail(function (xhr) {
					LOGGER.warn('! Posting failed: ', xhr.status, ' ', xhr.statusText, ' ', xhr.responseText, '.');
				});
			}, CONFIG.maxRetries, CONFIG.minDelay, 2, CONFIG.maxDelay).fail(function () {
				LOGGER.error('Job result post failed too many times. Not retrying anymore.');
			});
		},
		
		drudge: function drudge() {
			var drudger = this;
			return base.Future.doWhile(function () {
				return drudger.getTask()
					.then(drudger.doWork.bind(drudger))
					.then(drudger.postResults.bind(drudger));
			}, function () { 
				return true; // Loop forever.
			}).fail(function (err) {
				LOGGER.error('Uncaught error on drudger! '+ err);
			});
		}
	}); // declare Drudger.
	
	APP.start = function start() {
		var args = {}; // Parse URL's query arguments.
		window.location.search.substring(1).split('&').forEach(function (arg) {
			arg = arg.split('=').map(decodeURIComponent);
			if (arg.length == 2) {
				args[arg[0]] = arg[1];
			}
		});
		return base.HttpRequest.getJSON(args.configURI || '/config.json').then(function (configJSON) {
			CONFIG = APP.CONFIG = base.copy(args, configJSON, { // Default configuration.
				jobURI: '/task.json',
				configURI: '/config.json',
				workerCount: 2,
				maxRetries: 50,
				minDelay: 100, // 100 milliseconds.
				maxDelay: 2 * 60000, // 2 minutes.
				logLength: 30, // 30 lines.
			});
			// Timestamp is used to compare with the server's.
			CONFIG.startTime = Date.now(); 
			// Setup logger.
			LOGGER.appendToHtml('log', CONFIG.logLength);
			LOGGER.info('Starting '+ CONFIG.workerCount +' workers.');
			// Start drudgers.
			APP.drudgers = base.Iterable.range(CONFIG.workerCount).map(function () {
				return new APP.Drudger();
			}).toArray();
			return base.Future.sequence(APP.drudgers, function (drudger) {
				return drudger.initialize().done(drudger.drudge.bind(drudger));
			});
		});
	}; // APP.start().
	
	if (document.readyState === 'complete') {
		APP.start();
	} else {
		window.addEventListener('load', APP.start, false);
	}
}); // require base.