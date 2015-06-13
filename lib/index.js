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
var OrawrapError = require(__dirname + '/error.js');

function Orawrap() {
    //Query result outFormat option constants
    this.ARRAY = oracledb.ARRAY;
    this.OBJECT = oracledb.OBJECT;

    //Constants for bind parameter type properties
    this.STRING = oracledb.STRING;
    this.NUMBER = oracledb.NUMBER;
    this.DATE = oracledb.DATE;

    //Constants for bind parameter dir properties
    this.BIND_IN = oracledb.BIND_IN;
    this.BIND_OUT = oracledb.BIND_OUT;
    this.BIND_INOUT = oracledb.BIND_INOUT;
}

Orawrap.prototype.setConnectInfo = function(ci) {
    connectInfo = {
        user: ci.user,
        password: ci.password,
        connectString: ci.connectString,
        externalAuth: ci.externalAuth
    };

    connectInfoSet = true;
};

Orawrap.prototype.createPool = function(config, cb) {
    return new Promise(function(resolve, reject) {
        var key = config.poolName || defaultPoolKey;
        var raiseError = function(errorMessage) {
            var error = new OrawrapError(errorMessage);

            reject(error);

            if (cb) {
                cb(error);
            }
        };

        if (poolsCreated > 0 && !config.poolName) {
            return raiseError('Connection pool name required when using more than 1.');
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
};

Orawrap.prototype.terminatePool = function(name, callback) {
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
        } else {
            poolMap[key].terminate(function(err) {
                if (err) {
                    reject(err);

                    if (cb) {
                        cb(err);
                    }

                    return;
                }

                delete poolMap[key];

                poolsCreated -= 1;

                resolve();

                if (cb) {
                    cb(null);
                }
            });
        }
    });
};

Orawrap.prototype.getPool = function(name) {
    var key = name || defaultPoolKey;

    if (!poolMap[key]) {
        throw new Error('No connection pool named "' + key + '" exists');
    }

    return poolMap[key];
};

Orawrap.prototype.addBuildupSql = function(statement) {
    var stmt = {
        sql: statement.sql,
        binds: statement.binds || {},
        options: statement.options || {}
    };

    buildupScripts.push(stmt);
};

Orawrap.prototype.addTeardownSql = function(statement) {
    var stmt = {
        sql: statement.sql,
        binds: statement.binds || {},
        options: statement.options || {}
    };

    teardownScripts.push(stmt);
};

Orawrap.prototype.getConnection = function(poolName, callback) {
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
};

Orawrap.prototype.execute = function(sql, bindParams, options, connection, cb) {
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
};

Orawrap.prototype.releaseConnection = function(connection) {
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
};

Orawrap.prototype.simpleExecute = function(sql, bindParams, options, cb) {
    var that = this;
    var promise;
    var resolver;
    var executeThenCb;
    var executeCatchCb;
    var conn;

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

    executeThenCb = function(results, resolve) {
        if (options.autoRelease === false) {
            results.connection = conn;
        }

        resolve(results);

        if (cb) {
            cb(null, results);
        }

        if (options.autoRelease === true) {
            process.nextTick(function() {
                that.releaseConnection(conn);
            });
        }
    };

    executeCatchCb = function(err, reject) {
        reject(err);

        if (cb) {
            cb(err);
        }

        if (conn && options.autoReleaseOnError === true) {
            process.nextTick(function() {
                that.releaseConnection(conn);
            });
        }
    };

    resolver = function(resolve, reject) {
        try {
            if (options.connection) {
                conn = options.connection;

                that.execute(sql, bindParams, options, conn)
                    .then(function(results) {
                        executeThenCb(results, resolve);
                    })
                    .catch(function(err) {
                        executeCatchCb(err, reject);
                    });
            } else {
                that.getConnection(options.poolName)
                    .then(function(connection) {
                        conn = connection;

                        return that.execute(sql, bindParams, options, conn);
                    })
                    .then(function(results) {
                        executeThenCb(results, resolve);
                    })
                    .catch(function(err) {
                        executeCatchCb(err, reject);
                    });
            }
        } catch (err) {
            reject(err);

            if (cb) {
                cb(err);
            }
        }
    };

    promise = new Promise(resolver);

    return promise;
};

module.exports = new Orawrap;
