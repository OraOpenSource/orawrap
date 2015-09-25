var oracledb = require('oracledb');
var Promise = require('es6-promise').Promise;
var async = require('async');
var OrawrapError = require(__dirname + '/orawraperror.js');

function PoolManager() {
    this._poolMap = {};
    this._poolCount = 0;
    this._defaultPoolKey = 'orawrap_default_pool';

    this.DEFAULT_POOL_NAME_USED = 'The pool name "' + this._defaultPoolKey + '" is reserved.';
    this.FIRST_POOL_NOT_NAMED = 'First pool not named (all connections pools require names when using more than 1).';
    this.POOL_NOT_NAMED = 'Pool not named (all connections pools require names when using more than 1).';
    this.DUP_POOL_NAME = 'A connection pool with the same name already exists.';
    this.POOL_DOES_NOT_EXIST = 'No connection pool named "{POOL_NAME}" exists';
}

PoolManager.prototype.getPoolCount = function() {
    return this._poolCount;
};

PoolManager.prototype.createPool = function(config, cb) {
    var resolver;
    var promise;
    var that = this;

    resolver = function(resolve, reject) {
        var key;
        var raiseError;
        try {
            key = config.poolName || that._defaultPoolKey;
            raiseError = function(errorMessage) {
                var error = new OrawrapError(errorMessage);

                reject(error);

                if (cb) {
                    cb(error);
                }
            };

            if (config.poolName === that._defaultPoolKey) {
                return raiseError(that.DEFAULT_POOL_NAME_USED);
            }

            if (that._poolCount === 1 && that.defaultPoolExists()) {
                return raiseError(that.FIRST_POOL_NOT_NAMED);
            }

            if (that._poolCount > 0 && !config.poolName) {
                return raiseError(that.POOL_NOT_NAMED);
            }

            if (that._poolMap[key]) {
                return raiseError(that.DUP_POOL_NAME);
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

                    that._poolCount += 1;

                    p._poolName = key;

                    p._q = async.queue(function(task, releaseCb) {
                        p.getConnection(function(err, conn) {
                            task.getConnCb(err, conn, releaseCb);
                        });
                    }, config.poolMax);

                    that._poolMap[key] = p;

                    resolve(that._poolMap[key]);

                    if (cb) {
                        cb(null, that._poolMap[key]);
                    }
                }
            );
        } catch(err) {
            reject(err);

            if (cb) {
                cb(err);
            }
        }
    };

    promise = new Promise(resolver);

    return promise;
};

PoolManager.prototype.defaultPoolExists = function() {
    return !!this._poolMap[this._defaultPoolKey];
};

PoolManager.prototype.getDefaultPool = function() {
    return this.getPool(this._defaultPoolKey);
};

PoolManager.prototype.poolExists = function(poolName) {
    return !!this._poolMap[poolName];
};

PoolManager.prototype.getPool = function(poolName) {
    if (poolName) {
        if (this._poolMap[poolName]) {
            return this._poolMap[poolName];
        } else {
            throw new OrawrapError(this.POOL_DOES_NOT_EXIST, {
                POOL_NAME: poolName
            });
        }
    } else {
        if (this.defaultPoolExists()) {
            return this.getDefaultPool();
        } else {
            throw new OrawrapError('No connection pool exists');
        }
    }
};

PoolManager.prototype.terminatePool = function(a1, a2) {
    var promise;
    var resolver;
    var that = this;
    var thatArgs = arguments;

    resolver = function(resolve, reject) {
        var poolNotFoundErr;
        var key;
        var cb;
        try {
            switch (thatArgs.length) {
                case 2:
                    if (typeof a1 === 'string') {
                        key = a1;
                    } else if (typeof a1 === 'object') {
                        key = a1._poolName;
                    }

                    cb = a2;

                    break;
                case 1:
                    if (typeof a1 === 'string') {
                        key = a1;
                    } else if (typeof a1 === 'object') {
                        key = a1._poolName;
                    } else if (typeof a1 === 'undefined') {
                        key = that._defaultPoolKey;
                    } else if (typeof a1 === 'function') {
                        cb = a1;
                        key = that._defaultPoolKey;
                    }

                    break;
            }

            if (!that._poolMap[key]) {
                poolNotFoundErr = new OrawrapError(that.POOL_DOES_NOT_EXIST, {
                    'POOL_NAME': key
                });

                reject(poolNotFoundErr);

                if (cb) {
                    cb(poolNotFoundErr);
                }
            } else {
                that._poolMap[key].terminate(function(err) {
                    if (err) {
                        reject(err);

                        if (cb) {
                            cb(err);
                        }

                        return;
                    }

                    delete that._poolMap[key];

                    that._poolCount -= 1;

                    resolve();

                    if (cb) {
                        cb(null);
                    }
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

module.exports = PoolManager;