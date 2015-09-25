var util = require('util');

module.exports.extend = function() {
    return util._extend.apply(this, arguments);
};

module.exports.getConfigFromEnv = function() {
    var config = {};

    config.user = process.env.ORAWRAP_TEST_USER || 'hr';
    config.password = process.env.ORAWRAP_TEST_PASSWORD || 'oracle';
    config.connectString = process.env.ORAWRAP_TEST_CONNECT_STRING || 'localhost/xe';
    config.poolMin = Number(process.env.ORAWRAP_TEST_POOL_MIN) || 2;
    config.poolMax = Number(process.env.ORAWRAP_TEST_POOL_MAX) || 20;
    config.poolIncrement = Number(process.env.ORAWRAP_TEST_POOL_INCREMENT) || 2;
    config.poolTimeout = Number(process.env.ORAWRAP_TEST_POOL_TIMEOUT) || 120;

    return config;
};
