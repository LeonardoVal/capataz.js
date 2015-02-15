/** [RequireJS](http://www.requirejs.org) module for [partition problem 2](../partition_problem2.js.html).

This module encapsulates the job function used in the second version of the partition problem.
*/
define([], function () {
	/** `exports` is the module object to contain all definition.
	*/
	var exports = {};
	
	/** The `jobFunction` takes the `partition` number and uses it bits to split the `numbers` into 
	two lists. The result includes the `partition` number, both sublists (`list0` and `list1`), and
	the difference (`diff`) of both sublists sums. If `diff` is zero, then the given `partition` 
	does split the `numbers` into two sublist with equal sums.
	*/
	exports.jobFunction = function jobFunction(partition, numbers) {
		var bits = partition.toString(2),
			list0 = [], 
			list1 = [],
			sum = 0, number;
		while (bits.length < numbers.length) { // Left pad the bits.
			bits = '0'+ bits;
		}
		for (var i = 0; i < numbers.length; ++i) {
			number = numbers[i];
			if (bits.charAt(i) === '0') {
				list0.push(number);
				sum += number;
			} else { // bits.charAt(i) === '1'
				list1.push(number);
				sum -= number;
			}
		}
		return { 
			partition: partition, 
			list0: list0, 
			list1: list1, 
			diff: sum 
		};
	}
	
	return exports;
}); // define