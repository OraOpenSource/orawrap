var oracledb = require('oracledb');
var Promise = require('es6-promise').Promise;
var async = require('async');

function ConnectionManager(poolManager) {
    this.buildupScripts = [];
    this.teardownScripts = [];
    this.connectInfo = {};
    this.connectInfoSet = false;
    this.poolManager = poolManager;
}

ConnectionManager.prototype.setConnectInfo = function(ci) {
    this.connectInfo = {
        user: ci.user,
        password: ci.password,
        connectString: ci.connectString,
        externalAuth: ci.externalAuth
    };

    this.connectInfoSet = true;
};

ConnectionManager.prototype.addBuildupSql = function(statement) {
    var stmt = {
        sql: statement.sql,
        binds: statement.binds || {},
        options: statement.options || {}
    };

    this.buildupScripts.push(stmt);
};

ConnectionManager.prototype.addTeardownSql = function(statement) {
    var stmt = {
        sql: statement.sql,
        binds: statement.binds || {},
        options: statement.options || {}
    };

    this.teardownScripts.push(stmt);
};

ConnectionManager.prototype.getConnection = function(poolName, callback) {
    var thatArgs = arguments;
    var that = this;

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
            if (that.poolManager.defaultPoolExists()) {
                pool = that.poolManager.getDefaultPool();
            }
        } else if (thatArgs.length === 1) {
            if (typeof poolName === "string") {
                key = poolName;

                if (that.poolManager.poolExists(key)) {
                    pool = that.poolManager.getPool(key);
                }

                explicitUsePool = poolName;
            } else if (typeof poolName === "undefined") {
                if (that.poolManager.defaultPoolExists()) {
                    pool = that.poolManager.getDefaultPool();
                }
            } else if (typeof poolName === "boolean") {
                explicitUsePool = poolName;
            } else if (typeof poolName === "function") {
                cb = poolName;
            }
        } else if (thatArgs.length === 2) {
            if (typeof poolName === "string") {
                key = poolName;

                if (that.poolManager.poolExists(key)) {
                    pool = that.poolManager.getPool(key);
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
        } else if (!that.connectInfoSet && that.poolManager.getPoolCount() > 1 && !key) {
            return raiseError('Pool name must be specified when using multiple connection pools');
        } else if (!that.connectInfoSet && that.poolManager.getPoolCount() === 0) {
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
                that.buildupScripts,
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
            oracledb.getConnection(that.connectInfo, getConnCb);
        }
    });
};

ConnectionManager.prototype.execute = function(sql, bindParams, options, connection, cb) {
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

ConnectionManager.prototype.releaseConnection = function(connection) {
    async.eachSeries(
        this.teardownScripts,
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

ConnectionManager.prototype.simpleExecute = function(sql, bindParams, options, cb) {
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

module.exports = ConnectionManager;
