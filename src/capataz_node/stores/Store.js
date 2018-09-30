/** # Store

Job stores are components dedicated to store the scheduled jobs and (possibly) its results.
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
			.object('statistics', { ignore: true })
			/** + `random` is a `Randomness` instance that can be used to break determinism.
			*/
			.object('random', { defaultValue: base.Randomness.DEFAULT });
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
		return this.random.choices(n, obj).map(function (p) {
			if (deleteTaken) {
				delete obj[p[0]];
			}
			return p;
		});
	}
}); // declare Store