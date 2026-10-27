const request = require('supertest');
const mongoose = require('mongoose');
const Account = require('../src/models/Account');
const Transaction = require('../src/models/Transaction');
const {
  app,
  UNKNOWN_ID,
  setupDatabase,
  createAccount,
  addTransaction,
  getBalance,
} = require('./helpers');

setupDatabase();

describe('POST /api/accounts/:id/transactions', () => {
  test('credit and debit update the balance', async () => {
    const account = await createAccount();

    const credit = await addTransaction(account.id, { type: 'credit', amount: 500.75, reference_id: 'ref-1' });
    expect(credit.status).toBe(201);
    expect(credit.body.balance).toBe(500.75);
    expect(credit.body.transaction).toMatchObject({ type: 'credit', amount: 500.75, reference_id: 'ref-1' });

    const debit = await addTransaction(account.id, { type: 'debit', amount: 200.5, reference_id: 'ref-2' });
    expect(debit.status).toBe(201);
    expect(debit.body.balance).toBe(300.25);
  });

  test('debit more than the balance is rejected', async () => {
    const account = await createAccount();
    await addTransaction(account.id, { type: 'credit', amount: 100, reference_id: 'ref-1' });

    const res = await addTransaction(account.id, { type: 'debit', amount: 100.01, reference_id: 'ref-2' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await getBalance(account.id)).toBe(100);
  });

  test.each([0, -10, '100', 10.555, null])('amount %p is rejected', async (amount) => {
    const account = await createAccount();
    const res = await addTransaction(account.id, { type: 'credit', amount, reference_id: 'ref-1' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('amount');
  });

  test('type must be credit or debit', async () => {
    const account = await createAccount();
    const res = await addTransaction(account.id, { type: 'refund', amount: 10, reference_id: 'ref-1' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('type');
  });

  test('unknown account gives a 404', async () => {
    const res = await addTransaction(UNKNOWN_ID, {
      type: 'credit',
      amount: 10,
      reference_id: 'ref-1',
    });
    expect(res.status).toBe(404);
  });

  test('duplicate reference_id is rejected and balance stays the same', async () => {
    const account = await createAccount();
    const first = await addTransaction(account.id, { type: 'credit', amount: 100, reference_id: 'ref-1' });

    const again = await addTransaction(account.id, { type: 'credit', amount: 100, reference_id: 'ref-1' });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DUPLICATE_TRANSACTION');
    expect(again.body.error.details.existing_transaction.id).toBe(first.body.transaction.id);
    expect(await getBalance(account.id)).toBe(100);
  });

  test('same reference_id is fine on a different account', async () => {
    const first = await createAccount('A');
    const second = await createAccount('B');

    await addTransaction(first.id, { type: 'credit', amount: 50, reference_id: 'shared-ref' });
    const res = await addTransaction(second.id, { type: 'credit', amount: 50, reference_id: 'shared-ref' });

    expect(res.status).toBe(201);
  });
});

describe('concurrency', () => {
  test('parallel debits never take the balance below zero', async () => {
    const account = await createAccount();
    await addTransaction(account.id, { type: 'credit', amount: 100, reference_id: 'topup' });

    // 10 debits of 30 at the same time, only 3 can fit in 100
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        addTransaction(account.id, { type: 'debit', amount: 30, reference_id: `debit-${i}` })
      )
    );

    const passed = results.filter((res) => res.status === 201);
    const failed = results.filter((res) => res.status === 422);
    expect(passed).toHaveLength(3);
    expect(failed).toHaveLength(7);
    expect(await getBalance(account.id)).toBe(10);
  });

  test('same reference_id sent in parallel is saved only once', async () => {
    const account = await createAccount();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        addTransaction(account.id, { type: 'credit', amount: 25, reference_id: 'retry-ref' })
      )
    );

    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(4);
    expect(await getBalance(account.id)).toBe(25);
  });
});

describe('data integrity', () => {
  test('balance always equals the sum of its transactions', async () => {
    const account = await createAccount();
    await addTransaction(account.id, { type: 'credit', amount: 1000, reference_id: 'r1' });
    await addTransaction(account.id, { type: 'debit', amount: 250.25, reference_id: 'r2' });
    await addTransaction(account.id, { type: 'debit', amount: 5000, reference_id: 'r3' }); // fails
    await addTransaction(account.id, { type: 'credit', amount: 0.5, reference_id: 'r4' });

    // add up credits and subtract debits straight from the database (values are in paise)
    const [sum] = await Transaction.aggregate([
      { $match: { account_id: new mongoose.Types.ObjectId(account.id) } },
      {
        $group: {
          _id: null,
          total: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', { $multiply: ['$amount', -1] }] } },
        },
      },
    ]);
    const saved = await Account.findById(account.id);

    expect(saved.balance).toBe(75025);
    expect(sum.total).toBe(75025);
  });

  test('the Transaction model blocks updating or deleting a transaction', async () => {
    const account = await createAccount();
    const res = await addTransaction(account.id, { type: 'credit', amount: 10, reference_id: 'r1' });
    const txId = res.body.transaction.id;

    await expect(Transaction.updateOne({ _id: txId }, { amount: 1 })).rejects.toThrow(
      'transactions cannot be updated or deleted'
    );
    await expect(Transaction.deleteOne({ _id: txId })).rejects.toThrow('transactions cannot be updated or deleted');

    const transaction = await Transaction.findById(txId);
    transaction.amount = 1;
    await expect(transaction.save()).rejects.toThrow('transactions cannot be updated or deleted');
  });

  test('database refuses a negative balance even without our code', async () => {
    const account = await createAccount();

    // raw driver call, skips mongoose and our service completely
    await expect(
      Account.collection.updateOne({ _id: new mongoose.Types.ObjectId(account.id) }, { $inc: { balance: -100 } })
    ).rejects.toThrow('Document failed validation');
  });

  test('there are no update or delete routes', async () => {
    const account = await createAccount();
    const res = await request(app).delete(`/api/accounts/${account.id}/transactions`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/accounts/:id/transactions', () => {
  async function seedHistory(accountId) {
    // 5 credits and 2 debits, added one by one so created_at increases
    for (let i = 1; i <= 5; i++) {
      await addTransaction(accountId, { type: 'credit', amount: 100, reference_id: `c${i}` });
    }
    await addTransaction(accountId, { type: 'debit', amount: 10, reference_id: 'd1' });
    await addTransaction(accountId, { type: 'debit', amount: 20, reference_id: 'd2' });
  }

  test('newest first with pagination info', async () => {
    const account = await createAccount();
    await seedHistory(account.id);

    const res = await request(app).get(`/api/accounts/${account.id}/transactions?page=1&limit=3`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t) => t.reference_id)).toEqual(['d2', 'd1', 'c5']);
    expect(res.body.pagination).toEqual({ page: 1, page_size: 3, total_records: 7, total_pages: 3 });
  });

  test('last page has the remaining rows', async () => {
    const account = await createAccount();
    await seedHistory(account.id);

    const res = await request(app).get(`/api/accounts/${account.id}/transactions?page=3&limit=3`);

    expect(res.body.data.map((t) => t.reference_id)).toEqual(['c1']);
  });

  test('filters by type', async () => {
    const account = await createAccount();
    await seedHistory(account.id);

    const res = await request(app).get(`/api/accounts/${account.id}/transactions?type=debit`);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((t) => t.type === 'debit')).toBe(true);
    expect(res.body.pagination.total_records).toBe(2);
  });

  test('defaults to page 1 and limit 10', async () => {
    const account = await createAccount();
    const res = await request(app).get(`/api/accounts/${account.id}/transactions`);

    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 1, page_size: 10, total_records: 0, total_pages: 0 });
  });

  test.each(['page=0', 'limit=500', 'page=abc', 'type=refund'])('bad query %s gives a 400', async (query) => {
    const account = await createAccount();
    const res = await request(app).get(`/api/accounts/${account.id}/transactions?${query}`);

    expect(res.status).toBe(400);
  });

  test('unknown account gives a 404', async () => {
    const res = await request(app).get(`/api/accounts/${UNKNOWN_ID}/transactions`);
    expect(res.status).toBe(404);
  });
});
