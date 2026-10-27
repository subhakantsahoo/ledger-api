const mongoose = require('mongoose');
const Account = require('./models/Account');
const Transaction = require('./models/Transaction');

// We create collections and indexes ourselves in connectDB(), in a fixed order
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);

// Rules that MongoDB itself checks on every insert and update.
// Even if some code skips our API checks, the database refuses
// a negative balance or a transaction with a wrong type/amount.
const collectionRules = {
  accounts: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'balance', 'created_at'],
      properties: {
        name: { bsonType: 'string', minLength: 1, maxLength: 100 },
        balance: { bsonType: 'number', minimum: 0 },
      },
    },
  },
  transactions: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['account_id', 'type', 'amount', 'reference_id', 'created_at'],
      properties: {
        account_id: { bsonType: 'objectId' },
        type: { enum: ['credit', 'debit'] },
        amount: { bsonType: 'number', minimum: 1 },
        reference_id: { bsonType: 'string', minLength: 1 },
      },
    },
  },
};

async function applyCollectionRules() {
  const db = mongoose.connection.db;

  for (const [name, validator] of Object.entries(collectionRules)) {
    const exists = await db.listCollections({ name }).hasNext();
    if (exists) {
      await db.command({ collMod: name, validator });
    } else {
      await db.createCollection(name, { validator });
    }
  }
}

async function connectDB(uri = process.env.MONGODB_URI) {
  await mongoose.connect(uri);
  await applyCollectionRules();
  // creates the indexes from the models, including the unique (account_id, reference_id)
  await Account.syncIndexes();
  await Transaction.syncIndexes();
}

// Runs the given function inside a MongoDB transaction.
// If anything throws, everything done with this session is rolled back.
// If two requests change the same account at once, MongoDB aborts one of them
// with a write conflict and mongoose simply runs it again.
function withTransaction(work) {
  return mongoose.connection.transaction(work);
}

module.exports = { connectDB, withTransaction };
