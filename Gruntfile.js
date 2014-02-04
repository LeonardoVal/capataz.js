/** Gruntfile for [capataz]().
*/
module.exports = function(grunt) {
// Init config. ////////////////////////////////////////////////////////////////
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		uglify: { //////////////////////////////////////////////////////////////
		  options: {
			banner: '//! <%= pkg.name %> <%= pkg.version %>\n',
			report: 'min'
		  },
		  capataz_node: {
			src: './src/capataz_node.js',
			dest: './capataz_node.js'
		  },
		  capataz_browser: {
			src: './src/capataz_browser.js',
			dest: './static/capataz_browser.js'
		  },
		  capataz_worker: {
			src: './src/capataz_worker.js',
			dest: './static/capataz_worker.js'
		  }
		}
	});

// Load tasks. /////////////////////////////////////////////////////////////////
	grunt.loadNpmTasks('grunt-contrib-uglify');

// Register tasks. /////////////////////////////////////////////////////////////
	grunt.registerTask('default', ['uglify']);
};