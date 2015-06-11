var oracledb = require('oracledb');
var Promise = require('es6-promise').Promise;
var async = require('async');
var poolMap = {};
var defaultPoolKey = 'default';
var poolsCreated = 0;
var buildupScripts = [];
var teardownScripts = [];
var connectInfo;
var connectInfoSet = false;

//Query result outFormat option constants
module.exports.ARRAY = oracledb.ARRAY;
module.exports.OBJECT = oracledb.OBJECT;

//Constants for bind parameter type properties
module.exports.STRING = oracledb.STRING;
module.exports.NUMBER = oracledb.NUMBER;
module.exports.DATE = oracledb.DATE;

//Constants for bind parameter dir properties
module.exports.BIND_IN = oracledb.BIND_IN;
module.exports.BIND_OUT = oracledb.BIND_OUT;
module.exports.BIND_INOUT = oracledb.BIND_INOUT;

function setConnectInfo(ci) {
    connectInfo = {
        user: ci.user,
        password: ci.password,
        connectString: ci.connectString,
        externalAuth: ci.externalAuth
    };

    connectInfoSet = true;
}

module.exports.setConnectInfo = setConnectInfo;

function createPool(config, cb) {
    return new Promise(function(resolve, reject) {
        var key = config.poolName || defaultPoolKey;
        var poolNameErr;
        var dupPoolErr;
        var raiseError = function(errorMessage) {
            var error = new Error(errorMessage);

            reject(error);

            if (cb) {
                cb(error);
            }
        };

        if (poolsCreated > 0 && poolMap[defaultPoolKey]) {
            return raiseError('All connection pools must have names when using more than 1');
        }

        if (poolMap[key]) {
            return raiseError('A connection pool named "' + key + '" already exists');
        }

        oracledb.createPool(
            config,
            function(err, p) {
                if (err) {
                    reject(err);

                    if (cb) {
                        cb(err);
                    }

                    return;
                }

                poolsCreated += 1;

                poolMap[key] = p;

                p.poolName = key;

                resolve(poolMap[key]);
                
                if (cb) {
                    cb(null, poolMap[key]);
                }
            }
        );
    });
}

module.exports.createPool = createPool;

function terminatePool(name, callback) {
    var key;
    var cb;

    if (arguments.length === 1) {
        key = defaultPoolKey;
        cb = name;
    } else if (arguments.length === 2) {
        key = name;
        cb = callback;
    }

    return new Promise(function(resolve, reject) {
        var poolNotFoundErr;

        if (!poolMap[key]) {
            poolNotFoundErr = new Error('No connection pool named "' + key + '" exists');

            reject(poolNotFoundErr);

            if (cb) {
                cb(poolNotFoundErr);
            }

            return;
        } else {
            poolMap[key].terminate(function(err) {
                if (err) {
                    reject(err);

                    if (cb) {
                        cb(err);
                    }

                    return;
                }

                resolve();

                if (cb) {
                    cb(null);
                }
            });
        }
    });
}

module.exports.terminatePool = terminatePool;

function getPool(name) {
    var key = name || defaultPoolKey;

    if (!poolMap[key]) {
        throw new Error('No connection pool named "' + key + '" exists');
    }

    return poolMap[key];
}

module.exports.getPool = getPool;

function addBuildupSql(statement) {
    var stmt = {
        sql: statement.sql,
        binds: statement.binds || {},
        options: statement.options || {}
    };

    buildupScripts.push(stmt);
}

module.exports.addBuildupSql = addBuildupSql;

function addTeardownSql(statement) {
    var stmt = {
        sql: statement.sql,
        binds: statement.binds || {},
        options: statement.options || {}
    };

    teardownScripts.push(stmt);
}

module.exports.addTeardownSql = addTeardownSql;

function getConnection(poolName, callback) {
    var thatArgs = arguments;

    return new Promise(function(resolve, reject) {
        var getConnCb;
        var pool;
        var key;
        var cb;
        var explicitUsePool = false;
        var raiseError = function(errorMessage) {
            var error = new Error(errorMessage);

            reject(error);

            if (cb) {
                cb(error);
            }
        };

        if (thatArgs.length === 0) {
            if (poolMap[defaultPoolKey]) {
                pool = poolMap[defaultPoolKey];
            }
        } else if (thatArgs.length === 1) {
            if (typeof poolName === "string") {
                key = poolName;

                if (poolMap[key]) {
                    pool = poolMap[key];
                }

                explicitUsePool = poolName;
            } else if (typeof poolName === "undefined") {
                if (poolMap[defaultPoolKey]) {
                    pool = poolMap[defaultPoolKey];
                }
            } else if (typeof poolName === "boolean") {
                explicitUsePool = poolName;
            } else if (typeof poolName === "function") {
                cb = poolName;
            }
        } else if (thatArgs.length === 2) {
            if (typeof poolName === "string") {
                key = poolName;

                if (poolMap[key]) {
                    pool = poolMap[key];
                }

                explicitUsePool = true;
            } else if (typeof poolName === "boolean") {
                explicitUsePool = poolName;
            }

            cb = callback;
        }

        //getConnection()                                      -using promise, try default pool then connect info
        //getConnection(undefined)                             -same
        //getConnection(true)                                  -using promise, ensure pool
        //getConnection(false)                                 -using promise, ensure setConnectInfo
        //getConnection('poolName')                            -using promise, ensure pool exists
        //getConnection(function doAfter() {})                 -using cb,      try default pool then connect info
        //getConnection(false, function doAfter() {})          -using cb,      ensure setConnectInfo
        //getConnection('poolName', function doAfter() {})     -using cb,      ensure pool exists

        if (explicitUsePool && key && !pool) {
            return raiseError('No connection pool named "' + key + '" exists');
        } else if (explicitUsePool && !key && !pool) { //couldn't find default
            return raiseError('A connection pool does not exist');
        } else if (!connectInfoSet && poolsCreated > 1 && !key) {
            return raiseError('Pool name must be specified when using multiple connection pools');
        } else if (!connectInfoSet && poolsCreated === 0) {
            return raiseError('setConnectInfo or createPool must be called prior to getting a connection');
        }

        getConnCb = function(err, connection) {
            if (err) {
                reject(err);

                if (cb) {
                    cb(err);
                }

                return;
            }

            async.eachSeries(
                buildupScripts,
                function(statement, callback) {
                    connection.execute(statement.sql, statement.binds, statement.options, function(err) {
                        callback(err);
                    });
                },
                function(err) {
                    if (err) {
                        reject(err);

                        if (cb) {
                            cb(err);
                        }

                        return;
                    }

                    resolve(connection);

                    if (cb) {
                        cb(null, connection);
                    }
                }
            );
        };

        if (pool) {
            pool.getConnection(getConnCb);
        } else {
            oracledb.getConnection(connectInfo, getConnCb);
        }
    });
}

module.exports.getConnection = getConnection;

function execute(sql, bindParams, options, connection, cb) {
    return new Promise(function(resolve, reject) {
        connection.execute(sql, bindParams, options, function(err, results) {
            if (err) {
                reject(err);

                if (cb) {
                    cb(err);
                }

                return;
            }

            resolve(results);

            if (cb) {
                cb(null, results);
            }
        });
    });
}

module.exports.execute = execute;

function releaseConnection(connection) {
    async.eachSeries(
        teardownScripts,
        function(statement, callback) {
            connection.execute(statement.sql, statement.binds, statement.options, function(err) {
                callback(err);
            });
        },
        function(err) {
            if (err) {
                console.error(err); //don't return as we still need to release the connection
            }

            connection.release(function(err) {
                if (err) {
                    console.error(err);
                }
            });
        }
    );
}

module.exports.releaseConnection = releaseConnection;

function simpleExecute(sql, bindParams, options, cb) {
    if (options.autoRelease !== false) {
        options.autoRelease = true;
    }

    if (options.autoReleaseOnError !== false) {
        options.autoReleaseOnError = true;
    }

    if (options.autoCommit === undefined) {//isAutoCommit was renamed to autoCommit in node-oracledb v0.5.0
        options.autoCommit = true;
    }

    if (options.isAutoCommit === undefined) {//isAutoCommit was left for backward compatibility, should probably remove in future
        options.isAutoCommit = true;
    }

    return new Promise(function(resolve, reject) {
        if (options.connection) {
            execute(sql, bindParams, options, options.connection)
                .then(function(results) {
                    if (options.autoRelease === false) {
                        results.connection = options.connection;
                    }

                    resolve(results);

                    if (cb) {
                        cb(null, results);
                    }

                    if (options.autoRelease === true) {
                        process.nextTick(function() {
                            releaseConnection(options.connection);
                        });
                    }
                })
                .catch(function(err) {
                    reject(err);

                    if (cb) {
                        cb(err);
                    }

                    if (options.autoReleaseOnError === true) {
                        process.nextTick(function() {
                            releaseConnection(options.connection);
                        });
                    }
                });
        } else {
            getConnection(options.poolName)
                .then(function(connection) {
                    execute(sql, bindParams, options, connection)
                        .then(function(results) {
                            if (options.autoRelease === false) {
                                results.connection = connection;
                            }

                            resolve(results);

                            if (cb) {
                                cb(null, results);
                            }

                            if (options.autoRelease === true) {
                                process.nextTick(function() {
                                    releaseConnection(connection);
                                });
                            }
                        })
                        .catch(function(err) {
                            reject(err);

                            if (cb) {
                                cb(err);
                            }

                            if (options.autoReleaseOnError === true) {
                                process.nextTick(function() {
                                    releaseConnection(connection);
                                });
                            }
                        });
                })
                .catch(function(err) {
                    reject(err);

                    if (cb) {
                        cb(err);
                    }
                });
        }
    });
}

module.exports.simpleExecute = simpleExecute;
