Capataz
=======

[![Built with Grunt](https://cdn.gruntjs.com/builtwith.png)](http://gruntjs.com/)

A framework to set up distributed algorithms via HTTP, HTML and Javascript, based on [NodeJS](http://nodejs.org/) and [Express](https://github.com/visionmedia/express).

## License

Open source under an MIT license. See [LICENSE](LICENSE.md).

## Development

Development requires [NodeJS](http://nodejs.org/) (ver >= 0.10) and [Grunt](http://gruntjs.com/). Download the repository and run `npm install` to install: [Express](https://github.com/visionmedia/express), [RequireJS](http://requirejs.org/), and some [Grunt](http://gruntjs.com/) plugins.

There is also a dependency with another library of mine: [creatartis-base](http://github.com/LeonardoVal/creatartis-base). It is included in `package.json` as a development dependency, but it is really a production dependency. It must be installed manually. This avoids problems which arise when `npm install` duplicates this module. Running [`npm dedupe`](https://www.npmjs.org/doc/cli/npm-dedupe.html) should help, yet as of the date this was written [it does not work when using URL dependencies](https://github.com/npm/npm/issues/3081#issuecomment-12486316).

## Contact

This software is being continually developed. Suggestions and comments are always welcome via [email](mailto:leonardo.val@creatartis.com).

Contributors:
* [Gonzalo Martínez](gonzalo.martinez@live.com).
