const mongoose = require('mongoose');
const { toRupees } = require('../utils/money');

const transactionSchema = new mongoose.Schema(
  {
    account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    // in paise, see utils/money.js
    amount: { type: Number, required: true, min: 1 },
    description: { type: String, default: null },
    reference_id: { type: String, required: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => ({
        id: ret._id,
        account_id: ret.account_id,
        type: ret.type,
        amount: toRupees(ret.amount),
        description: ret.description,
        reference_id: ret.reference_id,
        created_at: ret.created_at,
      }),
    },
  }
);

// same reference_id can't be used twice on one account,
// but two different accounts can use the same one
transactionSchema.index({ account_id: 1, reference_id: 1 }, { unique: true });

// history API filters by account and sorts by newest first
transactionSchema.index({ account_id: 1, created_at: -1 });

// Transactions are append only. The API has no update/delete routes,
// and these hooks stop it from anywhere else in the code as well.
function blockChanges() {
  throw new Error('transactions cannot be updated or deleted');
}

transactionSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  blockChanges
);

transactionSchema.pre('save', function () {
  if (!this.isNew) blockChanges();
});

module.exports = mongoose.model('Transaction', transactionSchema);
