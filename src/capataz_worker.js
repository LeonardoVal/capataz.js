/** # Capataz [web worker](http://www.w3schools.com/html/html5_webworkers.asp)

This module defines the web worker part of a Capataz client. This is the actual
worker that executes the jobs' code in the client machine. 
*/
(function (self) { "use strict";
	/** A provisional event handler prevents jobs to be passed before the web worker
	has properly initialized. 
	*/
	self.onmessage = function (msg) {
		var data = JSON.parse(msg.data);
		data.error = "Worker is not ready yet.";
		self.postMessage(JSON.stringify(data));
	};

	/** All modules are handled by [RequireJS](http://requirejs.org/).
	*/
	importScripts('require.js');

	/** Library `creatartis-base` is used mainly to handle asynchronism (with
	`Future`).
	*/
	require(['creatartis-base'], function (base) {
		self.base = base;
		/** The `onmessage` event handler is updated to receive jobs, execute them
		and send the result back to the rendering thread.
		*/
		self.onmessage = function onmessage(msg) {
			var data = JSON.parse(msg.data),
				code = '(function () {"use strict";\n'+ // Job wrapper.
					'\treturn base.Future.imports.apply(this, '+ JSON.stringify(data.imports || []) +').then(function (deps) {\n'+
						'\t\treturn ('+ data.fun +').apply(this, deps.concat('+ JSON.stringify(data.args || []) +'));\n'+
					'\t});\n'+
				'})()';
			
			base.Future.invoke(eval, self, code).then(function (result) {
				data.result = result;
				self.postMessage(JSON.stringify(data));
			}, function (error) { 
				data.error = 'Execution failed with "'+ error +'"!\nCode:\n'+ code +'\nCallstack:\n\t'+
					base.callStack(error).join('\n\t'); // Error instances are not serializable.
				self.postMessage(JSON.stringify(data));
			});
		};
		/** Signal to the rendering thread this worker is ready. */
		self.postMessage("Ready");
	});
})(self);