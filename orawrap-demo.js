var orawrap = require('./index.js');
var config = require('./config.js');
var employeesApi;

function initApi() {
    orawrap.setConfig(config.database);

    orawrap.createTableApi('orawrap_demo_employees')
        .then(function(api) {
            employeesApi = api;

            demoFindOne();
        })
}

initApi();

function demoFindOne() {
    employeesApi.findOne()
        .then(function(emp) {
            console.log('This is one random employee:', emp);
            demoFindOne2();
        })
        .catch(function(err) {
            console.error(err);
        })
}

function demoFindOne2() {
    employeesApi.findOne({
        employee_id: 101
    })
        .then(function(emp) {
            console.log('Similar, but this time we know who it is:', emp);

            demoFind();
        })
        .catch(function(err) {
            console.error(err);
        })
}

function demoFind() {
    employeesApi.find({
        last_name: {$like: "A%"}
    })
        .then(function(emps) {
            console.log('Find gives us an array:', emps);

            demoFind2();
        })
        .catch(function(err) {
            console.error(err);
        })
}

function demoFind2() {
    employeesApi.find({
        $or: [
            {job_id: 'IT_PROG'},
            {salary: {$gt: 15000}}
        ]
    })
        .then(function(emps) {
            console.log('Here are the results of a more complex query:', emps);
        })
        .catch(function(err) {
            console.error(err);
        })
}