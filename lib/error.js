function OrawrapError(message) {
    Error.call(this);
    Error.captureStackTrace(this, this.callee);
    this.name = 'OrawrapError';
    this.message = message || 'An error has occurred in orawrap';
}

OrawrapError.prototype = Object.create(Error.prototype);
OrawrapError.prototype.constructor = Error;

module.exports = OrawrapError;