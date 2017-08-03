/** # Server side module for [Node](http://nodejs.org)
*/
(function (exports) { "use strict";
	/** This module depends on [ExpressJS](http://expressjs.com/),
	[`creatartis-base`](https://github.com/LeonardoVal/creatartis-base) and others.
	*/
	var path = require('path'),
		filesystem = require('fs'),
		express = require('express'),
		base = require('creatartis-base'),
		Sermat = require('sermat');
	Sermat.modifiers.mode = Sermat.CIRCULAR_MODE;
	Sermat.include('Function');

	/** Dependencies are exported so they may be used by user code.
	*/
	exports.__package__ = 'capataz_node';
	exports.__name__ = 'capataz_node';
	exports.__dependencies__ = [express, base, Sermat];
	exports.__SERMAT__ = { include: [] };

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
