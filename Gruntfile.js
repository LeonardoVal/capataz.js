/** Gruntfile for [capataz]().
*/
var path = require('path');

module.exports = function(grunt) {
	var SOURCE_FILES = ['__prologue__', 
			'server', 'stores', 
		'__epilogue__'].map(function (path) {
			return 'src/capataz_node/'+ path +'.js';
		});
// Init config. ////////////////////////////////////////////////////////////////////////////////////
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clean: { ///////////////////////////////////////////////////////////////////////////////////
			build: ["build"]
		},
		concat: { //////////////////////////////////////////////////////////////////////////////////
			options: {
				separator: '\n\n',
				sourceMap: true
			},
			build: {
				src: SOURCE_FILES,
				dest: 'build/capataz_node.js'
			},
		},
		copy: { ////////////////////////////////////////////////////////////////////////////////////
			build: {
				files: [{ src: 'static/**', dest: 'build/', expand: true },
					{ src: 'node_modules/requirejs/require.js', 
						dest: 'build/static/require.js', nonull: true },
					{ src: 'node_modules/sermat/build/sermat-amd-min.js', 
						dest: 'build/static/sermat.js', nonull: true },
					{ src: 'node_modules/sermat/build/sermat-amd-min.js.map',
						dest: 'build/static/sermat.js.map', nonull: true },
					{ src: 'node_modules/creatartis-base/build/creatartis-base.min.js',
						dest: 'build/static/creatartis-base.js', nonull: true },
					{ src: 'node_modules/creatartis-base/build/creatartis-base.min.js.map',
						dest: 'build/static/creatartis-base.js.map', nonull: true }
				]
			}
		},
		jshint: { //////////////////////////////////////////////////////////////////////////////////
			build: {
				options: { // Check <http://jshint.com/docs/options/>.
					loopfunc: true,
					boss: true
				},
				src: ['src/capataz_*.js', 'build/capataz_node.js'],
			},
		},
		uglify: { //////////////////////////////////////////////////////////////////////////////////
			options: {
				banner: '//! <%= pkg.name %> <%= pkg.version %>\n',
				report: 'min'
			},
			capataz_node: {
				src: './build/capataz_node.js',
				dest: './build/capataz_node.min.js'
			},
			capataz_browser: {
				src: './src/capataz_browser.js',
				dest: './build/static/capataz_browser.js'
			},
			capataz_worker: {
				src: './src/capataz_worker.js',
				dest: './build/static/capataz_worker.js'
			}
		},
		mochaTest: { ///////////////////////////////////////////////////////////////////////////////
			test: {
				options: {
					reporter: 'spec'
				},
				src: ['tests/specs/*.test.js']
			}
		},
		docker: { //////////////////////////////////////////////////////////////////////////////////
			build: {
				src: ["src/**/*.js", "tests/**/*.js", "README.md", "docs/**/*.md"],
				dest: "docs/docker",
				options: {
					colourScheme: 'borland',
					ignoreHidden: true,
					exclude: 'src/**/__*__.js'
				}
			}
		}
	});

// Load tasks. /////////////////////////////////////////////////////////////////////////////////////
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-docker');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-mocha-test');

// Register tasks. /////////////////////////////////////////////////////////////////////////////////
	grunt.registerTask('compile', ['clean:build', 'copy:build', 'concat:build', 'jshint:build', 
		'uglify']);
	grunt.registerTask('test', ['mochaTest:test']);
	grunt.registerTask('build', ['compile', 'test', 'docker']);
	grunt.registerTask('default', ['build']);
};