/* Copyright (c) 2015, Oracle and/or its affiliates. All rights reserved. */

/******************************************************************************
 *
 * You may not use the identified files except in compliance with the Apache
 * License, Version 2.0 (the "License.")
 *
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NAME
 *   database.js
 *
 * DESCRIPTION
 *   A wrapper module for node-oracledb.
 *
 *****************************************************************************/

var oracledb = require('oracledb');
var Promise = require('es6-promise').Promise;
var async = require('async');
var pool;
var buildupScripts = [];
var teardownScripts = [];

module.exports.OBJECT = oracledb.OBJECT;

function createPool(config) {
    return new Promise(function(resolve, reject) {
        oracledb.createPool(
            config,
            function(err, p) {
                if (err) {
                    return reject(err);
                }

                pool = p;

                resolve(pool);
            }
        );
    });
}

module.exports.createPool = createPool;

function terminatePool() {
    return new Promise(function(resolve, reject) {
        if (pool) {
            pool.terminate(function(err) {
                if (err) {
                    return reject(err);
                }

                resolve();
            });
        } else {
            resolve();
        }
    });
}

module.exports.terminatePool = terminatePool;

function getPool() {
    return pool;
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

function getConnection() {
    return new Promise(function(resolve, reject) {
        pool.getConnection(function(err, connection) {
            if (err) {
                return reject(err);
            }

            async.eachSeries(
                buildupScripts,
                function(statement, callback) {
                    connection.execute(statement.sql, statement.binds, statement.options, function(err) {
                        callback(err);
                    });
                },
                function (err) {
                    if (err) {
                        return reject(err);
                    }

                    resolve(connection);
                }
            );
        });
    });
}

module.exports.getConnection = getConnection;

function execute(sql, bindParams, options, connection) {
    return new Promise(function(resolve, reject) {
        connection.execute(sql, bindParams, options, function(err, results) {
            if (err) {
                return reject(err);
            }

            resolve(results);
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
        function (err) {
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

function simpleExecute(sql, bindParams, options) {
    return new Promise(function(resolve, reject) {
        getConnection()
            .then(function(connection){
                execute(sql, bindParams, options, connection)
                    .then(function(results) {
                        resolve(results);

                        process.nextTick(function() {
                            releaseConnection(connection);
                        });
                    })
                    .catch(function(err) {
                        if (err) {
                            return reject(err);
                        }

                        process.nextTick(function() {
                            releaseConnection(connection);
                        });
                    });
            })
            .catch(function(err) {
                reject(err);
            });
    });
}

module.exports.simpleExecute = simpleExecute;