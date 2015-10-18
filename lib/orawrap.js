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
    this.BLOB = oracledb.BLOB;
    this.BUFFER = oracledb.BUFFER;
    this.CLOB = oracledb.CLOB;
    this.CURSOR = oracledb.CURSOR;
    this.DEFAULT = oracledb.DEFAULT;

    //Constants for bind parameter dir properties
    this.BIND_IN = oracledb.BIND_IN;
    this.BIND_OUT = oracledb.BIND_OUT;
    this.BIND_INOUT = oracledb.BIND_INOUT;

    this.poolManager = new PoolManager();
    this.connectionManager = new ConnectionManager(this.poolManager);
}

Orawrap.prototype.createPool = function(config, cb) {
    return this.poolManager.createPool.apply(this.poolManager, arguments);
};

Orawrap.prototype.terminatePool = function(poolName, cb) {
    return this.poolManager.terminatePool.apply(this.poolManager, arguments);
};

Orawrap.prototype.getPool = function() {
    return this.poolManager.getPool.apply(this.poolManager, arguments);
};

Orawrap.prototype.setConnectInfo = function() {
    return this.connectionManager.setConnectInfo.apply(this.connectionManager, arguments);
};

Orawrap.prototype.addBuildupSql = function() {
    return this.connectionManager.addBuildupSql.apply(this.connectionManager, arguments);
};

Orawrap.prototype.addTeardownSql = function() {
    return this.connectionManager.addTeardownSql.apply(this.connectionManager, arguments);
};

Orawrap.prototype.getConnection = function() {
    return this.connectionManager.getConnection.apply(this.connectionManager, arguments);
};

Orawrap.prototype.releaseConnection = function() {
    return this.connectionManager.releaseConnection.apply(this.connectionManager, arguments);
};

Orawrap.prototype.execute = function() {
    return this.connectionManager.execute.apply(this.connectionManager, arguments);
};

module.exports = Orawrap;