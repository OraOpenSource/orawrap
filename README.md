# orawrap

## PROJECT NOT MAINTAINED
This project is no longer maintained. I've been working to bring the best parts of Orawrap (and more) to the core driver. Please use the core driver over this module.


Orawrap is a wrapper module for the Oracle Database driver for Node.js ([node-oracledb](https://github.com/oracle/node-oracledb)). Some of the features include:

* A pool manager that provides pool storage and retrieval methods as well as connection request queuing
* A connection manager that provides a simplified execute method (can open and close connections automatically)
* Support for centralizing SQL scripts to be executed at various timings

###Example 1: One off script (without a connection pool)
```javascript
var orawrap = require('orawrap');
var dbConfig = {
    user: 'hr',
    password: 'welcome',
    connectString: 'localhost/xe'
};

//Setting the connection info only needs to be done once as it's stored internally
orawrap.setConnectInfo(dbConfig);

//Orawrap's execute method will handle obtaining a connection and then release
//it after execution
orawrap.execute(
   'SELECT employee_id, ' +
   '   first_name, ' +
   '   last_name, ' +
   '   phone_number, ' +
   '   hire_date ' +
   'FROM employees',
   function(err, results) {
      if (err) {
         throw err;
      }
      
      //process results
   }
);
```

###Example 2: Web server (with a connection pool)
**server.js**
```javascript
var express = require('express');
var app = express();
var employeesRoutes = require(__dirname + '/routes/employees.js');
var orawrap = require('orawrap');
var dbConfig = {
    user: 'hr',
    password: 'welcome',
    connectString: 'localhost/xe',
    poolMax: 20,
    poolMin: 2,
    poolIncrement: 2,
    poolTimeout: 10
};

//Add a handler for get requests on /api/employees
app.get('/api/employees', employeesRoutes.get);

//Use orawrap to create a connection pool prior to starting the web server 
orawrap.createPool(dbConfig, function(err, pool) {
   //The pool that was created is provided in the callback function, 
   //but it's rarely needed as it's stored within orawrap for use later
   if (err) throw err;
   
   //Start the web server now that the pool is ready to handle incoming requests
   app.listen(3000, function() {
       console.log('Web server listening on localhost: 3000');
   });
});
```

**/routes/employees.js**
```javascript
var orawrap = require('orawrap');

//When requests are routed to "get", the pool is already available for use
function get(req, res, next) {
   //Orawrap's execute method will handle obtaining a connection from the connection pool 
   //and then release it after execution
   orawrap.execute(
       'SELECT employee_id, ' +
       '   first_name, ' +
       '   last_name, ' +
       '   phone_number, ' +
       '   hire_date ' +
       'FROM employees',
       function(err, results) {
          if (err) {
             next(err);
             return;
          }
          
          res.send(results.rows);
       }
   );
}

module.exports.get = get;

```

## Prerequisite

Orawrap requires the [node-oracledb](https://github.com/oracle/node-oracledb) module to be available, either globally or locally. See the [installation documentation on node-oracledb] (https://github.com/oracle/node-oracledb/blob/master/INSTALL.md) for details on how to install the module in your environment.

## Installation



## License

  [MIT](LICENSE)
