var oracledb = require('oracledb');
var Promise = require('es6-promise').Promise;
var async = require('async');
var OrawrapError = require(__dirname + '/orawraperror.js');

function ConnectionManager(poolManager) {
    this.buildupScripts = [];
    this.teardownScripts = [];
    this.connectInfo = {};
    this.connectInfoSet = false;
    this.poolManager = poolManager;

    this.CONN_INFO_POOL_NOT_INIT = 'setConnectInfo or createPool must be called prior to getting a connection';
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

ConnectionManager.prototype.getConnectInfo = function() {
    return this.connectInfo;
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

ConnectionManager.prototype.getConnection = function(a1, a2) {
    var resolver;
    var promise;
    var that = this;
    var thatArgs = arguments;

    resolver = function(resolve, reject) {
        var getConnCb;
        var pool;
        var key;
        var cb;
        var explicitUsePool = false;
        var raiseError;

        try {
            raiseError = function(errorMessage) {
                var error = new OrawrapError(errorMessage);

                reject(error);

                if (cb) {
                    cb(error);
                }
            };

            switch (thatArgs.length) {
                case 2:
                    cb = a2;

                    if (a1 === undefined  && that.poolManager.defaultPoolExists()) {
                        pool = that.poolManager.getDefaultPool();
                    } else if (typeof a1 === "string") {
                        key = a1;

                        if (that.poolManager.poolExists(key)) {
                            pool = that.poolManager.getPool(key);
                        }

                        explicitUsePool = true;
                    }  else if (typeof a1 === "object" && a1._poolName) {
                        key = a1._poolName;

                        if (that.poolManager.poolExists(key)) {
                            pool = that.poolManager.getPool(key);
                        }

                        explicitUsePool = true;
                    }

                    break;
                case 1:
                    if (typeof a1 === "string") {
                        key = a1;

                        if (that.poolManager.poolExists(key)) {
                            pool = that.poolManager.getPool(key);
                        }

                        explicitUsePool = true;
                    } else if (typeof a1 === "object" && a1._poolName) {
                        key = a1._poolName;

                        if (that.poolManager.poolExists(key)) {
                            pool = that.poolManager.getPool(key);
                        }

                        explicitUsePool = true;
                    }  else if (typeof a1 === "function") {
                        cb = a1;

                        if (that.poolManager.defaultPoolExists()) {
                            pool = that.poolManager.getDefaultPool();
                        }
                    }

                    break;
                case 0:
                    if (that.poolManager.defaultPoolExists()) {
                        pool = that.poolManager.getDefaultPool();
                    }

                    break;
            }

            if (explicitUsePool && key && !pool) {
                return raiseError('No connection pool named "' + key + '" exists');
            } else if (explicitUsePool && !key && !pool) { //couldn't find default
                return raiseError('A connection pool does not exist');
            } else if (!that.connectInfoSet && that.poolManager.getPoolCount() > 1 && !key) {
                return raiseError('Pool name must be specified when using multiple connection pools');
            } else if (!that.connectInfoSet && that.poolManager.getPoolCount() === 0) {
                return raiseError(that.CONN_INFO_POOL_NOT_INIT);
            }

            getConnCb = function(err, connection, releaseCb) {
                if (err) {
                    reject(err);

                    if (cb) {
                        cb(err);
                    }

                    return;
                }

                if (pool) {
                    connection._poolName = pool._poolName;
                    connection._releaseCb = releaseCb;
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
                            that.releaseConnection(connection);

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
                pool._q.push({
                    getConnCb: getConnCb
                });
            } else {
                oracledb.getConnection(that.connectInfo, getConnCb);
            }
        } catch (err) {
            console.log(err);

            reject(err);

            if (cb) {
                cb(err);
            }
        }
    };

    promise = new Promise(resolver);

    return promise;
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

                if (connection._releaseCb) {
                    connection._releaseCb();
                }
            });
        }
    );
};

ConnectionManager.prototype.execute = function(a1, a2, a3, a4) {
    var that = this;
    var thatArgs = arguments;
    var promise;
    var resolver;

    resolver = function(resolve, reject) {
        var successCb;
        var errorCb;
        var conn;
        var sql;
        var bindParams = {};
        var opts = {};
        var cb;

        try {
            switch (thatArgs.length) {
                case 4:
                    sql = a1;
                    bindParams = a2;
                    opts = a3;
                    cb = a4;
                    break;
                case 3:
                    sql = a1;
                    bindParams = a2;

                    switch (typeof a3) {
                        case 'object':
                            opts = a3;
                            break;
                        case 'function':
                            cb = a3;
                            break;
                    }

                    break;
                case 2:
                    sql = a1;

                    switch (typeof a2) {
                        case 'object':
                            bindParams = a2;
                            break;
                        case 'function':
                            cb = a2;
                            break;
                    }

                    break;
                case 1:
                    sql = a1;
            }

            if (opts.autoRelease !== false) {
                opts.autoRelease = true;
            }

            if (opts.autoReleaseOnError !== false) {
                opts.autoReleaseOnError = true;
            }

            if (opts.autoCommit === undefined) {
                opts.autoCommit = true;
            }

            successCb = function(results, resolve) {
                if (opts.autoRelease === false) {
                    results.connection = conn;
                }

                resolve(results);

                if (cb) {
                    cb(null, results);
                }

                if (opts.autoRelease === true) {
                    process.nextTick(function() {
                        that.releaseConnection(conn);
                    });
                }
            };

            errorCb = function(err, reject) {
                reject(err);

                if (cb) {
                    cb(err);
                }

                if (conn && opts.autoReleaseOnError === true) {
                    process.nextTick(function() {
                        that.releaseConnection(conn);
                    });
                }
            };

            if (opts.connection) {
                conn = opts.connection;

                conn.execute(sql, bindParams, opts, function(err, results) {
                    if (err) {
                        errorCb(err, reject);
                        return;
                    }

                    successCb(results, resolve);
                });
            } else {
                that.getConnection(opts.poolName, function(err, connection) {
                    if (err) {
                        errorCb(err, reject);
                        return;
                    }

                    conn = connection;

                    conn.execute(sql, bindParams, opts, function(err, results) {
                        if (err) {
                            errorCb(err, reject);
                            return;
                        }

                        successCb(results, resolve);
                    });
                });
            }
        } catch (err) {
            errorCb(err, reject);
        }
    };

    promise = new Promise(resolver);

    return promise;
};

module.exports = ConnectionManager;
