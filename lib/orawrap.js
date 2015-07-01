var oracledb = require('oracledb');
var PoolManager = require(__dirname + '/poolmanager.js');
var ConnectionManager = require(__dirname + '/connectionmanager.js');

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

    this.poolManager = new PoolManager();
    this.connectionManager = new ConnectionManager(this.poolManager);
}

Orawrap.prototype.createPool = function(config, cb) {
    return this.poolManager.createPool(config, cb);
};

Orawrap.prototype.terminatePool = function(poolName, cb) {
    return this.poolManager.terminatePool(poolName, cb);
};

Orawrap.prototype.getPool = function(poolName) {
    return this.poolManager.getPool(poolName);
};

Orawrap.prototype.setConnectInfo = function(ci) {
    return this.connectionManager.setConnectInfo(ci);
};

Orawrap.prototype.addBuildupSql = function(statement) {
    return this.connectionManager.addBuildupSql(statement);
};

Orawrap.prototype.addTeardownSql = function(statement) {
    return this.connectionManager.addTeardownSql(statement);
};

Orawrap.prototype.getConnection = function(poolName, cb) {
    return this.connectionManager.getConnection(poolName, cb);
};

Orawrap.prototype.execute = function(sql, bindParams, options, connection, cb) {
    return this.connectionManager.execute(sql, bindParams, options, connection, cb);
};

Orawrap.prototype.releaseConnection = function(connection) {
    return this.connectionManager.releaseConnection(connection);
};

Orawrap.prototype.simpleExecute = function(sql, bindParams, options, cb) {
    return this.connectionManager.simpleExecute(sql, bindParams, options, cb);
};

module.exports = Orawrap;