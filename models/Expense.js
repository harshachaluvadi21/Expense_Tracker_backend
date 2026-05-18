const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  shopName: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    default: null
  }
}, { timestamps: true });

// User requested MongoDB collection name: expense
module.exports = mongoose.model('Expense', expenseSchema, 'expense');
