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
var config;
var configSet = false;

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

function setConfig(cfg) {
    if (configSet) {
        console.log('Configuration for orawrap already set, using existing configuration');
        return;
    }

    if (cfg.poolMax && (process.env.UV_THREADPOOL_SIZE || 4) < cfg.poolMax) {
        console.warn('process.env.UV_THREADPOOL_SIZE is insufficient for node-oracledb poolMax');
    }

    config = cfg;
    configSet = true;
}

module.exports.setConfig = setConfig;

function createPool() {
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

function getConnection(opts) {
    return new Promise(function(resolve, reject) {
        var cb = function(err, connection) {
            if (err) {
                return reject(err);
            }

            if (opts.execBuildupScripts) {
                async.eachSeries(
                    buildupScripts,
                    function(statement, callback) {
                        connection.execute(statement.sql, statement.binds, statement.options, function(err) {
                            callback(err);
                        });
                    },
                    function(err) {
                        if (err) {
                            return reject(err);
                        }

                        resolve(connection);
                    }
                );
            } else {
                resolve(connection);
            }
        };

        if (pool) {
            pool.getConnection(cb);
        } else {
            oracledb.getConnection({
                user: config.user,
                password: config.password,
                connectString: config.connectString
            }, cb);
        }
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

function releaseConnection(connection, opts) {
    process.nextTick(function() {
        if (opts.execTeardownScripts) {
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
        } else {
            connection.release(function(err) {
                if (err) {
                    console.error(err);
                }
            });
        }
    });
}

module.exports.releaseConnection = releaseConnection;

function simpleExecute(sql, bndPrm, opts, execBs, execTd) {
    var bindParams = bndPrm || {};
    var options = opts || {};
    var executeBuildupScripts = execBs !== false;
    var execTeardownScripts = execTd !== false;

    if (options.autoCommit === undefined) {//isAutoCommit was renamed to autoCommit in node-oracledb v0.5.0
        options.autoCommit = true;
    }

    if (options.isAutoCommit === undefined) {//isAutoCommit was left for backward compatibility, should probably remove in future
        options.isAutoCommit = true;
    }

    return new Promise(function(resolve, reject) {
        getConnection({
            execBuildupScripts: executeBuildupScripts
        })
            .then(function(connection) {
                execute(sql, bindParams, options, connection)
                    .then(function(results) {
                        resolve(results);

                        releaseConnection(connection, {execTeardownScripts: execTeardownScripts});
                    })
                    .catch(function(err) {
                        reject(err);

                        releaseConnection(connection, {execTeardownScripts: execTeardownScripts});
                    });
            })
            .catch(function(err) {
                reject(err);
            });
    });
}

module.exports.simpleExecute = simpleExecute;

function createTableApi(opts) {
    return new Promise(function(resolve, reject) {
        var tapi = {};
        var tableName;
        var columns = [];
        var columnsMap = {};
        var columnsSql;
        var constraints;
        var constraintsSql;
        var connection;
        var primaryKey;

        function assertSimpleSqlName(sqlName) {//extend later
            return sqlName;
        }

        function isTableColumn(columnName) {
            if (columnsMap[columnName.toUpperCase()]) {
                return true;
            } else {
                return false;
            }
        }

        function getSqlOperator(jsOperator) {
            switch (jsOperator) {
                case '$and': return ' and ';
                case '$or': return ' or ';
            }
        }

        function isLogicalOperator(jsOperator) {
            switch (jsOperator) {
                case '$and': return true;
                case '$or': return true;
                case '$not': return true;
                default: return false;
            }
        }

        function isComparisonOperator(jsOperator) {
            switch (jsOperator) {
                case '$eq':
                case '$ne':
                case '$lt':
                case '$lte':
                case '$gt':
                case '$gte':
                case '$instr':
                case '$ninstr':
                case '$like':
                case '$nlike':
                case '$null':
                case '$nnull':
                case '$notnull':
                case '$between':
                    return true;
                default: return false;
            }
        }

        function getBindType(dataType) {
            if (dataType === 'VARCHAR2') {
                return oracledb.STRING;
            } else if (dataType === 'NUMBER') {
                return oracledb.NUMBER;
            }

            throw new Error('Bind type not set for ' + dataType);
        }

        function getInsPlsql(row) {
            var insPlsql;
            var colIdx;

            insPlsql = '' +
            'begin \n' +
            '    insert into ' + tableName + ' ( \n';

            colIdx = 0;

            columns.forEach(function(column, idx) {
                colNameLc = column.name.toLowerCase();

                if (row[colNameLc]) {
                    if (colIdx === 0) {
                        insPlsql += '        ';
                    } else {
                        insPlsql += '      , ';
                    }

                    insPlsql += column.name + ' \n';
                    colIdx += 1;
                }
            });

            insPlsql += '' +
            '    ) values ( \n';

            colIdx = 0;

            columns.forEach(function(column, idx) {
                colNameLc = column.name.toLowerCase();

                if (row[colNameLc]) {
                    if (colIdx === 0) {
                        insPlsql += '        ';
                    } else {
                        insPlsql += '      , ';
                    }

                    insPlsql += ':' + column.name.toLowerCase() + ' \n';
                    colIdx += 1;
                }
            });

            insPlsql += '' +
            '    ) \n' +
            '    returning \n';

            columns.forEach(function(column, idx) {
                if (idx === 0) {
                    insPlsql += '        ';
                } else {
                    insPlsql += '      , ';
                }

                insPlsql += column.name + ' \n';
            });

            insPlsql += ' ' +
            '    into \n';

            columns.forEach(function(column, idx) {
                if (idx === 0) {
                    insPlsql += '        ';
                } else {
                    insPlsql += '      , ';
                }

                insPlsql += ':' + column.name.toLowerCase() + ' \n';
            });

            insPlsql += '' +
            '    ; \n' +
            'end; ';

            return insPlsql;
        }

        function getSelectClause() {
            var selectClause = 'select ';

            columns.forEach(function(column, idx) {
                if (idx > 0) {
                    selectClause += ', ';
                }

                selectClause += column.name + ' as "' + column.name.toLowerCase() + '" \n';
            });

            return selectClause;
        }

        function getPredicatesAndBinds(query, b, cc) {
            var predicates = '';
            var binds = b || [];
            var predicatesAndBinds;
            var queryKeys;
            var columnContext = cc;

            if (!query) {
                return {
                    predicates: predicates,
                    binds: binds
                }
            }

            predicates += '(';

            queryKeys = Object.keys(query);

            queryKeys.forEach(function(queryKey) {
                var sqlLogOper;

                if (isLogicalOperator(queryKey)) {
                    if (Array.isArray(query[queryKey])) {
                        sqlLogOper = getSqlOperator(queryKey);

                        query[queryKey].forEach(function(logicalOperand, idx) {
                            if (idx > 0) {
                                predicates += sqlLogOper;
                            }

                            predicatesAndBinds = getPredicatesAndBinds(logicalOperand, binds, columnContext);
                            predicates += predicatesAndBinds.predicates;
                        });
                    } else {
                        throw new Error('Logical operator value must be an array');
                    }
                } else if (isTableColumn(queryKey)) {
                    columnContext = queryKey;

                    if (Array.isArray(query[queryKey])) {
                        query[queryKey].forEach(function(queryPart, idx) {
                            if (idx > 0) {
                                predicates += ' AND ';
                            }

                            predicatesAndBinds = getPredicatesAndBinds(queryPart, binds, columnContext);
                            predicates += predicatesAndBinds.predicates;
                        });
                    } else if (typeof query[queryKey] === 'object') {
                        predicatesAndBinds = getPredicatesAndBinds(query[queryKey], binds, columnContext);
                        predicates += predicatesAndBinds.predicates;
                    } else {//must be primitive, implicit eq on column??? could it be an array?
                        predicates += columnContext + ' = :' + (binds.length + 1);
                        binds.push(query[queryKey]);
                    }
                } else if (isComparisonOperator(queryKey)) {
                    if (!columnContext) {
                        throw new Error('Column context not set');
                    }

                    switch (queryKey) {
                        case '$eq':
                            predicates += columnContext + ' = :' + (binds.length + 1);
                            binds.push(query[queryKey]);
                            break;
                        case '$neq':
                            predicates += columnContext + ' != :' + (binds.length + 1);
                            binds.push(query[queryKey]);
                            break;
                        case '$lt':
                            predicates += columnContext + ' < :' + (binds.length + 1);
                            binds.push(query[queryKey]);
                            break;
                        case '$lte':
                            predicates += columnContext + ' <= :' + (binds.length + 1);
                            binds.push(query[queryKey]);
                            break;
                        case '$gt':
                            predicates += columnContext + ' > :' + (binds.length + 1);
                            binds.push(query[queryKey]);
                            break;
                        case '$gte':
                            predicates += columnContext + ' >= :' + (binds.length + 1);
                            binds.push(query[queryKey]);
                            break;
                        case '$instr':
                            predicates += ' instr(' + columnContext + ', :' + (binds.length + 1) + ') >= 1';
                            binds.push(query[queryKey]);
                            break;
                        case '$ninstr':
                        case '$notinstr':
                            predicates += ' instr(' + columnContext + ', :' + (binds.length + 1) + ') = 0';
                            binds.push(query[queryKey]);
                            break;
                        case '$like':
                            predicates += columnContext + ' like ' + ':' + (binds.length + 1);
                            binds.push(query[queryKey]);
                            break;
                        case '$nlike':
                        case '$notlike':
                            predicates += columnContext + ' not like ' + ':' + (binds.length + 1);
                            binds.push(query[queryKey]);
                            break;
                        case '$null':
                            predicates += columnContext + ' is null ';
                            break;
                        case '$nnull':
                        case '$notnull':
                            predicates += columnContext + ' is not null ';
                            break;
                        case '$between':
                            if (!Array.isArray(query[queryKey])) {
                                throw new Error('$between value must be an array');
                            }

                            if (query[queryKey].length !== 2) {
                                throw new Error('$between value must have 2 elements');
                            }

                            predicates += columnContext + ' between ' +
                            ':' + (binds.length + 1) +
                            ' and ' +
                            ':' + (binds.length + 2);

                            binds.push(query[queryKey][0]);
                            binds.push(query[queryKey][1]);
                    }
                } else {
                    throw new Error('Invalid query key');
                }
            });

            predicates += ')';

            return {
                predicates: predicates,
                binds: binds
            }
        }

        if (typeof opts === 'string') {//extend later
            tableName = opts;
        }

        tableName = assertSimpleSqlName(tableName).toUpperCase();

        columnsSql = '' +
        'select column_name as "name", \n' +
        '    data_type as "dataType", \n' +
        '    data_length as "dataLength", \n' +
        '    data_precision as "dataPrecision", \n' +
        '    data_scale as "dataScale", \n' +
        '    nullable as "nullable" \n'  +
        'from user_tab_cols \n' +
        'where table_name = \'' + tableName + '\' \n' +
        'order by column_id asc';

        constraintsSql = '' +
        'select uc.constraint_name as "name", \n' +
        '    uc.constraint_type as "type", \n' +
        '    listagg(ucc.column_name, \',\') within group (order by ucc.position asc) as "columnsStr" \n' +
        'from user_constraints uc \n' +
        'join user_cons_columns ucc \n' +
        '    on uc.table_name = ucc.table_name \n' +
        '        and uc.constraint_name = ucc.constraint_name \n' +
        'where uc.table_name = \'' + tableName + '\' \n' +
        'group by uc.constraint_name, \n' +
        '    uc.constraint_type ';

        getConnection({
            execBuildupScripts: false
        })
            .then(function(conn) {
                connection = conn;

                return execute(
                    columnsSql,
                    {},
                    {
                        outFormat: oracledb.OBJECT
                    },
                    connection
                );
            })
            .then(function(columnsSqlResults) {
                var cols = columnsSqlResults.rows;

                if (cols.length === 0) {
                    throw new Error('Table "' + tableName + '" does not exist.');
                }

                cols.forEach(function(column) {
                    columns.push(column);
                    columnsMap[column.name] = column;
                });

                return execute(
                    constraintsSql,
                    {},
                    {
                        outFormat: oracledb.OBJECT
                    },
                    connection
                );
            })
            .then(function(constraintsSqlResults) {
                constraints = constraintsSqlResults.rows;

                constraints.forEach(function(constraint) {
                    constraint.columns = constraint.columnsStr.split(',');

                    delete constraint.columnsStr;

                    if (constraint.type === 'P') {
                        primaryKey = constraint;
                    }
                });

                releaseConnection(connection, {execTeardownScripts: false});

                resolve(tapi);
            })
            .catch(function(err) {
                releaseConnection(connection, {execTeardownScripts: false});

                reject(err);
            });

        tapi.getTableName = function() {
            return tableName;
        };

        tapi.getConstraints = function() {
            return constraints;
        };

        tapi.getPk = function() {
            return primaryKey;
        };

        tapi.find = function(query) {
            return new Promise(function(resolve, reject) {
                var findSql;
                var predicatesAndBinds;
                var options = {
                    outFormat: oracledb.OBJECT
                };

                findSql = getSelectClause();

                findSql += '' +
                'from ' + tableName + ' \n' +
                'where 1 = 1 \n';

                predicatesAndBinds = getPredicatesAndBinds(query, undefined, undefined);

                if (predicatesAndBinds.predicates) {
                    findSql += ' and ' + predicatesAndBinds.predicates;
                }

                simpleExecute(findSql, predicatesAndBinds.binds, options, false, false)
                    .then(function(results) {
                        resolve(results.rows);
                    })
                    .catch(function(err) {
                        reject(err);
                    });
            });
        };

        tapi.findOne = function(query) {
            return new Promise(function(resolve, reject) {
                var findOneSql;
                var predicatesAndBinds;
                var options = {
                    outFormat: oracledb.OBJECT
                };

                findOneSql = getSelectClause();

                findOneSql += '' +
                'from ' + tableName + ' \n' +
                'where rownum = 1 \n';

                predicatesAndBinds = getPredicatesAndBinds(query);

                if (predicatesAndBinds.predicates) {
                    findOneSql += ' and ' + predicatesAndBinds.predicates;
                }

                simpleExecute(findOneSql, predicatesAndBinds.binds, options, false, false)
                    .then(function(results) {
                        resolve(results.rows[0]);
                    })
                    .catch(function(err) {
                        reject(err);
                    });
            });
        };

        tapi.insert = function(row) {
            return new Promise(function(resolve, reject) {
                var binds = {};
                var insPlsql = getInsPlsql(row);

                columns.forEach(function(column) {
                    var colNameLc = column.name.toLowerCase();

                    if (row[colNameLc]) {
                        binds[colNameLc] = {
                            val: row[colNameLc],
                            dir: oracledb.BIND_INOUT,
                            type: getBindType(column.dataType)
                        }
                    } else {
                        binds[colNameLc] = {
                            dir: oracledb.BIND_OUT,
                            type: getBindType(column.dataType)
                        }
                    }
                });

                simpleExecute(insPlsql, binds, {}, false, false)
                    .then(function(results) {
                        resolve(results.outBinds);
                    })
                    .catch(function(err) {
                        reject(err);
                    });
            });
        };
    });
}

module.exports.createTableApi = createTableApi;
