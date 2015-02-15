/** Gruntfile for [capataz]().
*/
module.exports = function(grunt) {
// Init config. ////////////////////////////////////////////////////////////////
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clean: { ///////////////////////////////////////////////////////////////
			build: ["build"]
		},
		copy: { ////////////////////////////////////////////////////////////////
			main: {
				files: [
					{ expand: true, cwd: 'static/', src: ['**'], dest: 'build/static/' },
					{ expand: true, cwd: 'lib/', src: ['**'], dest: 'build/static/' },
				]
			}
		},
		uglify: { //////////////////////////////////////////////////////////////
		  options: {
			banner: '//! <%= pkg.name %> <%= pkg.version %>\n',
			report: 'min'
		  },
		  capataz_node: {
			src: './src/capataz_node.js',
			dest: './build/capataz_node.js'
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
		docker: { //////////////////////////////////////////////////////////////
			build: {
				src: ["src/**/*.js", "tests/**/*.js", "README.md", "docs/**/*.md"],
				dest: "docs/docker",
				options: {
					colourScheme: 'borland',
					ignoreHidden: true
				}
			}
		},
		bowercopy: { ///////////////////////////////////////////////////////////
			options: {
				clean: true,
				runBower: true,
				srcPrefix: 'bower_components',
				destPrefix: 'lib'
			},
			lib: {
				files: {
					'require.js': 'requirejs/require.js',
					'creatartis-base.js': 'creatartis-base/build/creatartis-base.js',
					'creatartis-base.js.map': 'creatartis-base/build/creatartis-base.js.map'
				},
			}
		}
	});

// Load tasks. /////////////////////////////////////////////////////////////////
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-docker');
	grunt.loadNpmTasks('grunt-bowercopy');
// Register tasks. /////////////////////////////////////////////////////////////
	grunt.registerTask('build', ['clean', 'copy', 'uglify', 'docker']);
	grunt.registerTask('default', ['build']);
	grunt.registerTask('lib', ['bowercopy']);
};