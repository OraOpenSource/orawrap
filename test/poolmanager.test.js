var PoolManager = require(__dirname + '/../lib/poolmanager.js');
var poolmanager;
var OrawrapError = require(__dirname + '/../lib/orawraperror.js');
var testUtil = require(__dirname + '/testutil.js');
var assert = require('chai').assert;
var config = {};
var configEnv = testUtil.getConfigFromEnv();

describe('poolmanager module:', function() {
    beforeEach(function(){
        poolmanager = new PoolManager();
        config = testUtil.extend({}, configEnv);
    });

    describe('create pool', function() {
        it('passes errors through the promise', function(done) {
            //not passsing a config obj will cause an error in oracledb
            poolmanager.createPool()
                .then(function(pool) {
                    done(new Error('created pool'));
                })
                .catch(function(err) {
                    assert.instanceOf(err, Error);

                    done();
                });
        });

        it('passes error through the callback', function(done) {
            //not passing a config obj will cause an error in oracledb
            poolmanager.createPool(undefined, function(err, pool) {
                if (err) {
                    assert.instanceOf(err, Error);
                    done();
                    return;
                }

                done(new Error('created pool'));
            });
        });

        it('returns a promise which provides the pool', function(done) {
            poolmanager.createPool(config)
                .then(function(pool) {
                    assert.equal(pool.connectionsInUse, 0);

                    done();
                })
                .catch(function(err) {
                    done(err);
                });
        });

        it('executes a callback when supplied which provides the pool', function(done) {
            poolmanager.createPool(config, function(err, pool) {
                if (err) {
                    return done(err);
                }

                assert.equal(pool.connectionsInUse, 0);

                done();
            });
        });

        it('creates a pool with the default name when poolName not supplied', function(done) {
            poolmanager.createPool(config)
                .then(function(pool) {
                    assert.equal(pool.connectionsInUse, 0);
                    assert.equal(pool.poolName, poolmanager._defaultPoolKey);

                    done();
                })
                .catch(function(err) {
                    done(err);
                });
        });

        it('can create multiple connection pools', function(done) {
            var pool1;
            var pool2;

            config.poolName = 'pool1';

            poolmanager.createPool(config)
                .then(function(p1) {
                    pool1 = p1;

                    config.poolName = 'pool2';

                    return poolmanager.createPool(config);
                })
                .then(function(p2) {
                    pool2 = p2;

                    assert.equal(pool1.connectionsInUse, 0);
                    assert.equal(pool2.connectionsInUse, 0);

                    done();
                })
                .catch(function(err) {
                    done(err);
                });
        });

        it('ensures pool names are unique', function(done) {
            config.poolName = 'pool1';

            poolmanager.createPool(config)
                .then(function() {
                    return poolmanager.createPool(config);
                })
                .then(function() {
                    done(new Error('Pool names were not unique'));
                })
                .catch(function(err) {
                    assert.instanceOf(err, OrawrapError);
                    assert.equal(err.message, poolmanager.DUP_POOL_NAME);

                    done();
                });
        });

        it('ensures default pool name not used explicitly', function(done) {
            config.poolName = poolmanager._defaultPoolKey;

            poolmanager.createPool(config)
                .then(function() {
                    done(new Error('Pool names were not unique'));
                })
                .catch(function(err) {
                    assert.instanceOf(err, OrawrapError);
                    assert.equal(err.message, poolmanager.DEFAULT_POOL_NAME_USED);

                    done();
                });
        });

        it('ensures pool names are used 1', function(done) {
            poolmanager.createPool(config)
                .then(function() {
                    config.poolName = 'pool2';

                    return poolmanager.createPool(config);
                })
                .then(function() {
                    done(new Error('The first pool did not have a name'));
                })
                .catch(function(err) {
                    assert.instanceOf(err, OrawrapError);
                    assert.equal(err.message, poolmanager.FIRST_POOL_NOT_NAMED);

                    done();
                });
        });

        it('ensures pool names are used 2', function(done) {
            config.poolName = 'pool1';

            poolmanager.createPool(config)
                .then(function() {
                    delete config.poolName;

                    return poolmanager.createPool(config);
                })
                .then(function() {
                    done(new Error('The second pool did not have a name'));
                })
                .catch(function(err) {
                    assert.instanceOf(err, OrawrapError);
                    assert.equal(err.message, poolmanager.POOL_NOT_NAMED);

                    done();
                });
        });
    });

    describe('terminate pool', function() {
        it('works when passed the default pool', function(done) {
            poolmanager.createPool(config, function(err, pool) {
                if (err) {
                    return done(err);
                }

                poolmanager.terminatePool(pool, function(err) {
                    if (err) {
                        return done(err);
                    }

                    done();
                });
            });
        });

        it('works when passed a non-default pool', function(done) {
            config.poolName = 'not the default';

            poolmanager.createPool(config, function(err, pool) {
                if (err) {
                    return done(err);
                }

                poolmanager.terminatePool(pool, function(err) {
                    if (err) {
                        return done(err);
                    }

                    done();
                });
            });
        });

        it('terminates the default pool when not passed a pool or pool name', function(done) {
            poolmanager.createPool(config, function(err, pool) {
                if (err) {
                    return done(err);
                }

                assert.isTrue(poolmanager.defaultPoolExists());

                poolmanager.terminatePool(function(err) {
                    if (err) {
                        return done(err);
                    }

                    assert.isFalse(poolmanager.defaultPoolExists());

                    done();
                });
            });
        });

        it('returns correct error if pool does not exist', function(done) {
            var badPoolName = 'some pool that does not exist';

            poolmanager.createPool(config, function(err, pool) {
                if (err) {
                    return done(err);
                }

                pool.poolName = badPoolName;

                poolmanager.terminatePool(pool, function(err) {
                    if (err) {
                        var correctError;

                        assert.instanceOf(err, OrawrapError);

                        correctError = new OrawrapError(poolmanager.POOL_DOES_NOT_EXIST, {
                            'POOL_NAME': badPoolName
                        });

                        assert.equal(correctError.message, err.message);

                        return done();
                    }

                    done(new Error('Did not get the correct error'));
                });
            });
        });
    });
});