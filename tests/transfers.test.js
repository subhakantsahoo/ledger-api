const request = require('supertest');
const {
  app,
  UNKNOWN_ID,
  setupDatabase,
  createAccount,
  addTransaction,
  getBalance,
} = require('./helpers');

setupDatabase();

function transfer(body) {
  return request(app).post('/api/transfers').send(body);
}

async function twoAccountsWithMoney() {
  const from = await createAccount('Sender');
  const to = await createAccount('Receiver');
  await addTransaction(from.id, { type: 'credit', amount: 500, reference_id: 'opening' });
  await addTransaction(to.id, { type: 'credit', amount: 500, reference_id: 'opening' });
  return { from, to };
}

describe('POST /api/transfers', () => {
  test('moves money from one account to another', async () => {
    const { from, to } = await twoAccountsWithMoney();

    const res = await transfer({ from_account_id: from.id, to_account_id: to.id, amount: 120.5, reference_id: 'tr-1' });

    expect(res.status).toBe(201);
    expect(res.body.from_account).toEqual({ account_id: from.id, balance: 379.5 });
    expect(res.body.to_account).toEqual({ account_id: to.id, balance: 620.5 });
    expect(res.body.transactions.map((t) => t.type)).toEqual(['debit', 'credit']);
  });

  test('not enough balance changes nothing', async () => {
    const { from, to } = await twoAccountsWithMoney();

    const res = await transfer({ from_account_id: from.id, to_account_id: to.id, amount: 500.01, reference_id: 'tr-1' });

    expect(res.status).toBe(422);
    expect(await getBalance(from.id)).toBe(500);
    expect(await getBalance(to.id)).toBe(500);
  });

  test('unknown receiver gives a 404 and the sender keeps the money', async () => {
    const { from } = await twoAccountsWithMoney();

    const res = await transfer({
      from_account_id: from.id,
      to_account_id: UNKNOWN_ID,
      amount: 100,
      reference_id: 'tr-1',
    });

    expect(res.status).toBe(404);
    expect(await getBalance(from.id)).toBe(500);
  });

  test('cannot transfer to the same account', async () => {
    const { from } = await twoAccountsWithMoney();

    const res = await transfer({ from_account_id: from.id, to_account_id: from.id, amount: 10, reference_id: 'tr-1' });

    expect(res.status).toBe(400);
  });

  test('repeating the same transfer reference is rejected', async () => {
    const { from, to } = await twoAccountsWithMoney();
    const body = { from_account_id: from.id, to_account_id: to.id, amount: 100, reference_id: 'tr-1' };

    await transfer(body);
    const again = await transfer(body);

    expect(again.status).toBe(409);
    expect(await getBalance(from.id)).toBe(400);
  });

  test('opposite transfers at the same time do not deadlock and keep the total', async () => {
    const { from, to } = await twoAccountsWithMoney();

    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(transfer({ from_account_id: from.id, to_account_id: to.id, amount: 10, reference_id: `ab-${i}` }));
      requests.push(transfer({ from_account_id: to.id, to_account_id: from.id, amount: 15, reference_id: `ba-${i}` }));
    }
    const results = await Promise.all(requests);

    expect(results.every((res) => res.status === 201)).toBe(true);
    expect(await getBalance(from.id)).toBe(550);
    expect(await getBalance(to.id)).toBe(450);
  });
});
