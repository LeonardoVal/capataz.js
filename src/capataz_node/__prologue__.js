/** # Server side module for [Node](http://nodejs.org)
*/
(function (exports) { "use strict";
	/** This module depends on [ExpressJS](http://expressjs.com/),
	[`creatartis-base`](https://github.com/LeonardoVal/creatartis-base) and others.
	*/
	var base = require('creatartis-base'),
		express = require('express'),
		path = require('path'),
		filesystem = require('fs');
	
	/** Dependencies are exported so they may be used by user code.
	*/
	exports.__name__ = 'capataz_node';
	exports.__dependencies__ = { 
		base: base, 
		express: express 
	};
	
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