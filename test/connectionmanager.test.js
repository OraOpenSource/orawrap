var PoolManager = require(__dirname + '/../lib/poolmanager.js');
var poolManager;
var ConnectionManager = require(__dirname + '/../lib/connectionmanager.js');
var connectionManager;
var OrawrapError = require(__dirname + '/../lib/orawraperror.js');
var testUtil = require(__dirname + '/testutil.js');
var assert = require('chai').assert;
var config = {};
var configEnv = testUtil.getConfigFromEnv();

describe('connectionmanager module:', function() {
    beforeEach(function(){
        poolManager = new PoolManager();
        connectionManager = new ConnectionManager(poolManager);
        config = testUtil.extend({}, configEnv);
    });

    describe('set/get connect info', function() {
        it('sets and gets the connect info', function(done) {
            var connectInfoIn;
            var connectInfoOut;

            connectInfoIn = {
                user: 'someuser',
                password: 'somepassword',
                connectString: 'somehost/xe',
                externalAuth: false
            };

            connectionManager.setConnectInfo(connectInfoIn);

            connectInfoOut = connectionManager.getConnectInfo();

            assert.deepEqual(connectInfoIn, connectInfoOut);

            done();
        });
    });

    describe('get connection', function() {
        it('throws an error if setConnectInfo or createPool is not called first', function(done) {
            connectionManager.getConnection(function(err, connection) {
                if (err) {
                    assert.instanceOf(err, OrawrapError);
                    assert.equal(err.message, connectionManager.CONN_INFO_POOL_NOT_INIT);
                    done();
                    return;
                }

                done(new Error('Got a connection'));
            });
        });

        it('gets a connection from the base class and returns via callback', function(done) {
            connectionManager.setConnectInfo(config);

            connectionManager.getConnection(function(err, connection) {
                if (err) {
                    done(err);
                    return;
                }

                assert.isFunction(connection.execute);

                done();
            });
        });

        it('gets a connection from the base class and returns via promise', function(done) {
            connectionManager.setConnectInfo(config);

            connectionManager.getConnection()
                .then(function(connection) {
                    assert.isFunction(connection.execute);

                    done();
                })
                .catch(function(err) {
                    done(err);
                });
        });

        it('gets a connection from a pool name', function(done) {
            poolManager.createPool(config, function(err, pool) {
                if (err) {
                    done(err);
                    return;
                }

                connectionManager.getConnection(pool.poolName, function(err, connection) {
                    if (err) {
                        done(err);
                        return;
                    }

                    assert.isFunction(connection.execute);

                    done();
                });
            });
        });

        it('gets a connection from a pool object', function(done) {
            poolManager.createPool(config, function(err, pool) {
                if (err) {
                    done(err);
                    return;
                }

                assert.equal(pool.connectionsInUse, 0);

                connectionManager.getConnection(pool, function(err, connection) {
                    if (err) {
                        done(err);
                        return;
                    }

                    assert.isFunction(connection.execute);
                    assert.equal(pool.connectionsInUse, 1);

                    done();
                });
            });
        });

        it('gets a connection from default pool over base class if possible', function(done) {
            connectionManager.setConnectInfo(config); //make this available, though it shouldn't be used

            poolManager.createPool(config, function(err, pool) {
                if (err) {
                    done(err);
                    return;
                }

                assert.equal(pool.connectionsInUse, 0);

                connectionManager.getConnection(function(err, connection) {
                    if (err) {
                        done(err);
                        return;
                    }

                    assert.isFunction(connection.execute);
                    assert.equal(pool.connectionsInUse, 1);

                    done();
                });
            });
        });

        it('gets a connection from the correct pool object', function(done) {
            config.poolName = 'pool1';

            poolManager.createPool(config, function(err, pool) {
                if (err) {
                    done(err);
                    return;
                }

                config.poolName = 'pool2';

                poolManager.createPool(config, function(err, pool) {
                    if (err) {
                        done(err);
                        return;
                    }

                    assert.equal(pool.connectionsInUse, 0);

                    connectionManager.getConnection('pool2', function(err, connection) {
                        if (err) {
                            done(err);
                            return;
                        }

                        assert.isFunction(connection.execute);
                        assert.equal(pool.connectionsInUse, 1);

                        done();
                    });
                });
            });
        });
    });

    describe('execute', function() {
        it('throws an error if setConnectInfo or createPool is not called first', function(done) {
            connectionManager.getConnection(function(err, connection) {
                if (err) {
                    assert.instanceOf(err, OrawrapError);
                    assert.equal(err.message, connectionManager.CONN_INFO_POOL_NOT_INIT);
                    done();
                    return;
                }

                done(new Error('Got a connection'));
            });
        });

        it('gets a connection from the base class and returns results via callback', function(done) {
            connectionManager.setConnectInfo(config);

            connectionManager.execute('select 1 from dual', function(err, results) {
                if (err) {
                    done(err);
                    return;
                }

                assert.equal(results.rows[0], 1);

                done();
            });
        });
    });
});