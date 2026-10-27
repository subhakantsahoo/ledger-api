const AppError = require('../utils/AppError');

function sendError(res, status, code, message, details) {
  res.status(status).json({ error: { code, message, details } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendError(res, err.status, err.code, err.message, err.details);
  }

  // express.json() throws this when the body is broken JSON
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
  }

  // unique index on (account_id, reference_id), in case two requests
  // with the same reference_id slip past our own check at the same moment
  if (err.code === 11000) {
    return sendError(res, 409, 'DUPLICATE_TRANSACTION', 'This transaction already exists');
  }

  console.error(err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong, please try again');
}

module.exports = errorHandler;
