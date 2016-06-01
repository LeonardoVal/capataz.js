var expect = require('chai').expect,
	base = require('creatartis-base');//,
	capataz = require('../../build/capataz_node');

describe('Capataz server', function () { //////////////////////////////////////////////////////////
  
	describe('#processResult()', function () { /////////////////////////////////////////////////////
		var server = new capataz.Capataz();
		
		it("should not fail with invalid input", function () {
			expect(server.processResult.bind(server, {})).to.not.Throw();
		});
	}); // describe '#processResult()'
	
}); // describe 'Capataz server'