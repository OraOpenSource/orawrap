var util = require('util');

module.exports.extend = function() {
    return util._extend.apply(this, arguments);
};