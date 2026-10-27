const request = require('supertest');
const { app, UNKNOWN_ID, setupDatabase, createAccount } = require('./helpers');

setupDatabase();

describe('POST /api/accounts', () => {
  test('creates an account with 0 balance', async () => {
    const res = await request(app).post('/api/accounts').send({ name: '  Ravi Kumar ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Ravi Kumar', balance: 0 });
    expect(res.body.id).toBeDefined();
    expect(res.body.created_at).toBeDefined();
  });

  test('name is required', async () => {
    const res = await request(app).post('/api/accounts').send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('name');
  });

  test('client cannot set the starting balance', async () => {
    const res = await request(app).post('/api/accounts').send({ name: 'Ravi', balance: 5000 });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('balance');
  });

  test('broken JSON gives a 400', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('GET /api/accounts/:id/balance', () => {
  test('returns account_id and balance', async () => {
    const account = await createAccount();
    const res = await request(app).get(`/api/accounts/${account.id}/balance`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ account_id: account.id, balance: 0 });
  });

  test('unknown account gives a 404', async () => {
    const res = await request(app).get(`/api/accounts/${UNKNOWN_ID}/balance`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  test('bad account id gives a 400', async () => {
    const res = await request(app).get('/api/accounts/123/balance');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ACCOUNT_ID');
  });
});
