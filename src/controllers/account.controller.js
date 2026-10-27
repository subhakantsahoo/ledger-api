const accountService = require('../services/account.service');
const { validateAccountId, validateCreateAccount } = require('../utils/validators');

// Express 5 passes errors from async handlers to the error handler,
// so no try/catch is needed in the controllers.

async function createAccount(req, res) {
  const { name } = validateCreateAccount(req.body);
  const account = await accountService.createAccount(name);
  res.status(201).json(account);
}

async function getAccount(req, res) {
  const accountId = validateAccountId(req.params.id);
  const account = await accountService.getAccountById(accountId);
  res.json(account);
}

async function getBalance(req, res) {
  const accountId = validateAccountId(req.params.id);
  const account = await accountService.getAccountById(accountId);
  const { id, balance } = account.toJSON();
  res.json({ account_id: id, balance });
}

module.exports = { createAccount, getAccount, getBalance };
