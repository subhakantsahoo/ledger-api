// Errors we throw on purpose (not found, validation, etc).
// The error handler turns these into a JSON response with the right status code.
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = AppError;
