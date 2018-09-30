/** # File store

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