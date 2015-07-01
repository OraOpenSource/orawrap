function OrawrapError(message, values) {
    Error.call(this);
    Error.captureStackTrace(this, this.callee);

    this.name = 'OrawrapError';
    this.message = (message) ? this.formatMessage(message, values) : 'An error has occurred in orawrap';
}

OrawrapError.prototype = Object.create(Error.prototype);
OrawrapError.prototype.constructor = OrawrapError;

OrawrapError.prototype.formatMessage = function(message, values) {
    var formattedMsg = message;
    var keys;

    if (values) {
        keys = Object.keys(values);

        keys.forEach(function(key) {
            formattedMsg = formattedMsg.replace('{' + key.toUpperCase() + '}', values[key]);
        });
    }

    return formattedMsg;
};

module.exports = OrawrapError;