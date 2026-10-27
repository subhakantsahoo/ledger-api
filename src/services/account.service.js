const Account = require('../models/Account');
const AppError = require('../utils/AppError');

function accountNotFound(accountId) {
  return new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found', { account_id: accountId });
}

async function createAccount(name) {
  // balance and created_at are set by the model (0 and now)
  return Account.create({ name });
}

async function getAccountById(accountId, session = null) {
  const account = await Account.findById(accountId).session(session);

  if (!account) {
    throw accountNotFound(accountId);
  }
  return account;
}

module.exports = { createAccount, getAccountById, accountNotFound };
