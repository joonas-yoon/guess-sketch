var fs = require('fs');

var spamFilter = function (convertedMessage){
	
};

var symbols = JSON.parse(fs.readFileSync( __dirname + '/symbols.json', 'utf8'));
var keywords = JSON.parse(fs.readFileSync( __dirname + '/keywords.json', 'utf8')).keywords;

spamFilter.prototype.convert = function (msg) {
	var returnMessage = msg;
	console.log(keywords);
	return returnMessage;
};

module.exports = new spamFilter();