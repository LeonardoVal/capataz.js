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