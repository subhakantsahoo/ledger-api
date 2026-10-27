const AppError = require('./AppError');

// MongoDB ObjectId: 24 hex characters
const ID_PATTERN = /^[0-9a-f]{24}$/i;
// plain positive number with max 2 decimals: 100, 99.5, 0.25
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const MAX_AMOUNT = 1000000000;
const TRANSACTION_TYPES = ['credit', 'debit'];

function throwIfErrors(errors) {
  if (errors.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request data', errors);
  }
}

function ensureObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_BODY', 'Request body must be a JSON object');
  }
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function checkAmount(amount, errors) {
  if (typeof amount !== 'number' || !MONEY_PATTERN.test(String(amount)) || amount <= 0) {
    errors.push({
      field: 'amount',
      message: 'amount must be a number greater than 0 with at most 2 decimal places',
    });
  } else if (amount > MAX_AMOUNT) {
    errors.push({ field: 'amount', message: `amount cannot be more than ${MAX_AMOUNT}` });
  }
}

function checkReferenceId(referenceId, errors) {
  if (isBlank(referenceId)) {
    errors.push({ field: 'reference_id', message: 'reference_id is required' });
  } else if (referenceId.trim().length > 100) {
    errors.push({ field: 'reference_id', message: 'reference_id must be 100 characters or less' });
  }
}

function checkDescription(description, errors) {
  if (description === undefined || description === null) return;

  if (typeof description !== 'string') {
    errors.push({ field: 'description', message: 'description must be a string' });
  } else if (description.trim().length > 255) {
    errors.push({ field: 'description', message: 'description must be 255 characters or less' });
  }
}

function cleanDescription(description) {
  return description ? description.trim() || null : null;
}

function validateAccountId(id) {
  if (!ID_PATTERN.test(id)) {
    throw new AppError(400, 'INVALID_ACCOUNT_ID', 'Account id must be a valid id (24 hex characters)');
  }
  return id.toLowerCase();
}

function validateCreateAccount(body) {
  ensureObject(body);
  const errors = [];

  if (isBlank(body.name)) {
    errors.push({ field: 'name', message: 'name is required' });
  } else if (body.name.trim().length > 100) {
    errors.push({ field: 'name', message: 'name must be 100 characters or less' });
  }

  if (body.balance !== undefined) {
    errors.push({ field: 'balance', message: 'balance cannot be set, every new account starts at 0' });
  }

  throwIfErrors(errors);
  return { name: body.name.trim() };
}

function validateTransaction(body) {
  ensureObject(body);
  const errors = [];

  if (!TRANSACTION_TYPES.includes(body.type)) {
    errors.push({ field: 'type', message: "type must be either 'credit' or 'debit'" });
  }
  checkAmount(body.amount, errors);
  checkReferenceId(body.reference_id, errors);
  checkDescription(body.description, errors);

  throwIfErrors(errors);
  return {
    type: body.type,
    amount: body.amount,
    reference_id: body.reference_id.trim(),
    description: cleanDescription(body.description),
  };
}

function validateTransfer(body) {
  ensureObject(body);
  const errors = [];

  const fromId = ID_PATTERN.test(body.from_account_id) ? body.from_account_id.toLowerCase() : null;
  const toId = ID_PATTERN.test(body.to_account_id) ? body.to_account_id.toLowerCase() : null;

  if (!fromId) {
    errors.push({ field: 'from_account_id', message: 'from_account_id must be a valid account id' });
  }
  if (!toId) {
    errors.push({ field: 'to_account_id', message: 'to_account_id must be a valid account id' });
  }
  if (fromId && fromId === toId) {
    errors.push({ field: 'to_account_id', message: 'cannot transfer money to the same account' });
  }
  checkAmount(body.amount, errors);
  checkReferenceId(body.reference_id, errors);
  checkDescription(body.description, errors);

  throwIfErrors(errors);
  return {
    from_account_id: fromId,
    to_account_id: toId,
    amount: body.amount,
    reference_id: body.reference_id.trim(),
    description: cleanDescription(body.description),
  };
}

// query params always come in as strings, "abc" or "1.5" are not allowed
function toWholeNumber(value, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return NaN;
  return Number(value);
}

function validateHistoryQuery(query) {
  const errors = [];
  const page = toWholeNumber(query.page, 1);
  const limit = toWholeNumber(query.limit, 10);

  if (query.type !== undefined && !TRANSACTION_TYPES.includes(query.type)) {
    errors.push({ field: 'type', message: "type must be either 'credit' or 'debit'" });
  }
  if (Number.isNaN(page) || page < 1) {
    errors.push({ field: 'page', message: 'page must be a whole number, 1 or more' });
  }
  if (Number.isNaN(limit) || limit < 1 || limit > 100) {
    errors.push({ field: 'limit', message: 'limit must be a whole number between 1 and 100' });
  }

  throwIfErrors(errors);
  return { type: query.type, page, limit };
}

module.exports = {
  validateAccountId,
  validateCreateAccount,
  validateTransaction,
  validateTransfer,
  validateHistoryQuery,
};
