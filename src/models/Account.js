const mongoose = require('mongoose');
const { toRupees } = require('../utils/money');

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // in paise, see utils/money.js
    balance: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
    // shape of the account in API responses
    toJSON: {
      transform: (doc, ret) => ({
        id: ret._id,
        name: ret.name,
        balance: toRupees(ret.balance),
        created_at: ret.created_at,
      }),
    },
  }
);

module.exports = mongoose.model('Account', accountSchema);
