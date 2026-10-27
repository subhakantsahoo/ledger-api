const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const { connectDB } = require('../src/db');

// an id that looks valid but doesn't belong to any account
const UNKNOWN_ID = '64b7f0c2a1b2c3d4e5f60718';

function setupDatabase() {
  beforeAll(() => connectDB());
  beforeEach(clearCollections);
  afterAll(() => mongoose.disconnect());
}

// Goes through the raw collection, because the Transaction model
// blocks every delete (transactions are append only)
async function clearCollections() {
  const db = mongoose.connection.db;
  await db.collection('transactions').deleteMany({});
  await db.collection('accounts').deleteMany({});
}

async function createAccount(name = 'Test User') {
  const res = await request(app).post('/api/accounts').send({ name });
  return res.body;
}

function addTransaction(accountId, body) {
  return request(app).post(`/api/accounts/${accountId}/transactions`).send(body);
}

async function getBalance(accountId) {
  const res = await request(app).get(`/api/accounts/${accountId}/balance`);
  return res.body.balance;
}

module.exports = { app, UNKNOWN_ID, setupDatabase, createAccount, addTransaction, getBalance };
