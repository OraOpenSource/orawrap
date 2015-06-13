
var orawrap = require(__dirname + '/../');
var assert = require('assert');
var config = {};

config.user = process.env.ORAWRAP_TEST_USER;
config.password = process.env.ORAWRAP_TEST_PASSWORD;
config.connectString = process.env.ORAWRAP_TEST_CONNECT_STRING;
config.poolMax = process.env.ORAWRAP_TEST_POOL_MIN;
config.poolMin = process.env.ORAWRAP_TEST_POOL_MAX;
config.poolIncrement = process.env.ORAWRAP_TEST_POOL_INCREMENT;
config.poolTimeout = process.env.ORAWRAP_TEST_POOL_TIMEOUT;

describe('orawrap module:', function() {
    describe('create pool', function() {
        it('returns a promise which provides the pool', function(done) {

            orawrap.createPool(config)
                .then(function(pool) {
                    assert.equal(pool.connectionsInUse, 0);

                    orawrap.terminatePool(function() {
                        done();
                    });
                })
                .catch(function(err) {
                    done(err);
                });
        });

        it('executes a callback when supplied which provides the pool', function(done) {
            orawrap.createPool(config, function(err, pool) {
                if (err) {
                    done(err);
                }

                assert.equal(pool.connectionsInUse, 0);

                orawrap.terminatePool(function() {
                    done();
                });
            });
        });
    });
});