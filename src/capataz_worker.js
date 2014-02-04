/** Capataz module to run in a web worker.
*/
"use strict";
// Prevent jobs to be passed until the web worker has initialized properly.
self.onmessage = function (msg) {
	var data = JSON.parse(msg.data);
	data.error = "Worker is not ready yet.";
	self.postMessage(JSON.stringify(data));
};

importScripts('require.js');
require(['basis'], function (basis) {
	self.basis = basis;
	self.onmessage = function onmessage(msg) {
		var data = JSON.parse(msg.data);
		basis.Future.invoke(eval, self, data.code || '').then(function (result) {
			data.result = result;
			self.postMessage(JSON.stringify(data));
		}, function (error) { 
			data.error = error +''; // Error instances are not serializable.
			self.postMessage(JSON.stringidy(data));
		});
	};
	self.postMessage("Ready"); // Signal to the rendering thread this worker is ready.
});