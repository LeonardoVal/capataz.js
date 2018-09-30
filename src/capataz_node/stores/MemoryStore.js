/* # Memory store

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