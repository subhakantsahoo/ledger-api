const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const AppError = require('../utils/AppError');
const { withTransaction } = require('../db');
const { toPaise, toRupees } = require('../utils/money');
const accountService = require('./account.service');

function findByReference(accountIds, referenceId, session) {
  return Transaction.find({ account_id: { $in: accountIds }, reference_id: referenceId }).session(session);
}

function duplicateError(existing) {
  return new AppError(409, 'DUPLICATE_TRANSACTION', 'A transaction with this reference_id already exists for this account', {
    existing_transaction: existing,
  });
}

// Takes money out only if the balance is enough.
// The check (balance >= amount) and the change happen in one single update,
// so two debits at the same time can never both pass on the same old balance.
async function takeMoney(accountId, amount, session) {
  const account = await Account.findOneAndUpdate(
    { _id: accountId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { returnDocument: 'after', session }
  );
  if (account) return account;

  // nothing matched, so either the account doesn't exist or the balance is too low
  const current = await accountService.getAccountById(accountId, session);
  throw new AppError(422, 'INSUFFICIENT_BALANCE', 'Not enough balance for this debit', {
    account_id: accountId,
    balance: toRupees(current.balance),
    requested: toRupees(amount),
  });
}

async function addMoney(accountId, amount, session) {
  const account = await Account.findOneAndUpdate(
    { _id: accountId },
    { $inc: { balance: amount } },
    { returnDocument: 'after', session }
  );
  if (!account) throw accountService.accountNotFound(accountId);
  return account;
}

async function addTransaction(accountId, { type, amount, reference_id, description }) {
  const amountInPaise = toPaise(amount);

  return withTransaction(async (session) => {
    // Duplicate check comes before the balance check, so a retried debit
    // gets "already exists" instead of a confusing "not enough balance"
    const [existing] = await findByReference([accountId], reference_id, session);
    if (existing) throw duplicateError(existing);

    const account =
      type === 'debit'
        ? await takeMoney(accountId, amountInPaise, session)
        : await addMoney(accountId, amountInPaise, session);

    const [transaction] = await Transaction.create(
      [{ account_id: accountId, type, amount: amountInPaise, description, reference_id }],
      { session }
    );

    return { transaction, balance: toRupees(account.balance) };
  });
}

async function getTransactions(accountId, { type, page, limit }) {
  // gives a 404 for unknown accounts instead of an empty list
  await accountService.getAccountById(accountId);

  const filter = { account_id: accountId };
  if (type) filter.type = type;

  // _id is only a tie breaker, for rows saved in the same millisecond
  const [totalRecords, transactions] = await Promise.all([
    Transaction.countDocuments(filter),
    Transaction.find(filter)
      .sort({ created_at: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return {
    account_id: accountId,
    data: transactions,
    pagination: {
      page,
      page_size: limit,
      total_records: totalRecords,
      total_pages: Math.ceil(totalRecords / limit),
    },
  };
}

async function transferMoney({ from_account_id, to_account_id, amount, reference_id, description }) {
  const amountInPaise = toPaise(amount);

  return withTransaction(async (session) => {
    const accounts = await Account.find({ _id: { $in: [from_account_id, to_account_id] } }).session(session);
    for (const accountId of [from_account_id, to_account_id]) {
      if (!accounts.some((account) => account.id === accountId)) {
        throw accountService.accountNotFound(accountId);
      }
    }

    const existing = await findByReference([from_account_id, to_account_id], reference_id, session);
    if (existing.length > 0) {
      throw new AppError(409, 'DUPLICATE_TRANSACTION', 'A transaction with this reference_id already exists on one of these accounts', {
        existing_transactions: existing,
      });
    }

    // if the credit or the insert below fails, this debit is rolled back too
    const fromAccount = await takeMoney(from_account_id, amountInPaise, session);
    const toAccount = await addMoney(to_account_id, amountInPaise, session);

    const [debit, credit] = await Transaction.create(
      [
        {
          account_id: from_account_id,
          type: 'debit',
          amount: amountInPaise,
          reference_id,
          description: description || `Transfer to ${to_account_id}`,
        },
        {
          account_id: to_account_id,
          type: 'credit',
          amount: amountInPaise,
          reference_id,
          description: description || `Transfer from ${from_account_id}`,
        },
      ],
      { session, ordered: true }
    );

    return {
      reference_id,
      amount,
      from_account: { account_id: from_account_id, balance: toRupees(fromAccount.balance) },
      to_account: { account_id: to_account_id, balance: toRupees(toAccount.balance) },
      transactions: [debit, credit],
    };
  });
}

module.exports = { addTransaction, getTransactions, transferMoney };
