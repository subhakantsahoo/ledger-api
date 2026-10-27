const transactionService = require('../services/transaction.service');
const {
  validateAccountId,
  validateTransaction,
  validateTransfer,
  validateHistoryQuery,
} = require('../utils/validators');

async function addTransaction(req, res) {
  const accountId = validateAccountId(req.params.id);
  const data = validateTransaction(req.body);

  const result = await transactionService.addTransaction(accountId, data);
  res.status(201).json(result);
}

async function getTransactionHistory(req, res) {
  const accountId = validateAccountId(req.params.id);
  const filters = validateHistoryQuery(req.query);

  const result = await transactionService.getTransactions(accountId, filters);
  res.json(result);
}

async function transferMoney(req, res) {
  const data = validateTransfer(req.body);
  const result = await transactionService.transferMoney(data);
  res.status(201).json(result);
}

module.exports = { addTransaction, getTransactionHistory, transferMoney };
