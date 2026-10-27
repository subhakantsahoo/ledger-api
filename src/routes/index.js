const express = require('express');
const accountController = require('../controllers/account.controller');
const transactionController = require('../controllers/transaction.controller');

const router = express.Router();

router.post('/accounts', accountController.createAccount);
router.get('/accounts/:id', accountController.getAccount);
router.get('/accounts/:id/balance', accountController.getBalance);

router.post('/accounts/:id/transactions', transactionController.addTransaction);
router.get('/accounts/:id/transactions', transactionController.getTransactionHistory);

router.post('/transfers', transactionController.transferMoney);

module.exports = router;
