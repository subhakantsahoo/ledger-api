require('dotenv').config({ quiet: true });

// Point the app at the test database before anything connects
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI || 'mongodb://localhost:27020/ledger_test?directConnection=true';
