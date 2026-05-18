const Expense = require('../models/Expense');
const { extractTextFromImage } = require('../utils/ocrService');
const { parseBillImage, parseBillText, generateInsights } = require('../utils/geminiService');
const fs = require('fs');

// Create Expense (manual or final saving of OCR processed form)
exports.createExpense = async (req, res) => {
  try {
    const { shopName, amount, date, category, imageUrl } = req.body;
    if (!shopName || !amount || !date || !category) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const newExpense = new Expense({
      shopName,
      amount: parseFloat(amount),
      date: new Date(date),
      category,
      imageUrl: imageUrl || null
    });

    await newExpense.save();
    return res.status(201).json({ success: true, message: 'Expense added successfully', data: newExpense });
  } catch (error) {
    console.error('Error adding expense:', error);
    return res.status(500).json({ success: false, message: 'Error adding expense', error: error.message });
  }
};

// OCR + Gemini Extraction (runs OCR, parses via Gemini, and returns details without saving to MongoDB)
exports.uploadOCR = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded.' });
    }

    const imagePath = req.file.path;
    const imageUrl = `/uploads/${req.file.filename}`;

    try {
      // Direct multimodal Gemini parsing bypassing GCP billing requirements!
      const extractedDetails = await parseBillImage(imagePath);

      return res.status(200).json({
        success: true,
        message: 'Bill text extracted and analyzed successfully by Gemini Multimodal AI',
        imageUrl: imageUrl,
        data: extractedDetails
      });
    } catch (ocrError) {
      console.error('OCR/AI processing failed, attempting to clean up file:', ocrError);
      // Clean up uploaded file if OCR processing failed to avoid orphaned files
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      return res.status(422).json({
        success: false,
        message: ocrError.message || 'Failed to extract text from the invoice. Please verify receipt readability or enter manually.',
        error: ocrError.message
      });
    }
  } catch (error) {
    console.error('Error in OCR pipeline:', error);
    return res.status(500).json({ success: false, message: 'Server error in OCR pipeline', error: error.message });
  }
};

// Read all Expenses
exports.getExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1 });
    return res.status(200).json({ success: true, count: expenses.length, data: expenses });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return res.status(500).json({ success: false, message: 'Error fetching expenses', error: error.message });
  }
};

// Update an Expense
exports.updateExpense = async (req, res) => {
  try {
    const { shopName, amount, date, category } = req.body;
    const { id } = req.params;

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    expense.shopName = shopName || expense.shopName;
    expense.amount = amount !== undefined ? parseFloat(amount) : expense.amount;
    expense.date = date ? new Date(date) : expense.date;
    expense.category = category || expense.category;

    await expense.save();
    return res.status(200).json({ success: true, message: 'Expense updated successfully', data: expense });
  } catch (error) {
    console.error('Error updating expense:', error);
    return res.status(500).json({ success: false, message: 'Error updating expense', error: error.message });
  }
};

// Delete an Expense
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    // Delete associated invoice image if exists
    if (expense.imageUrl) {
      const fullPath = `./backend${expense.imageUrl}`;
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await Expense.findByIdAndDelete(id);
    return res.status(200).json({ success: true, message: 'Expense removed successfully' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    return res.status(500).json({ success: false, message: 'Error deleting expense', error: error.message });
  }
};

// Get AI Insights
exports.getAIInsights = async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1 }).limit(50); // Analyze recent 50 expenses
    const insights = await generateInsights(expenses);
    return res.status(200).json({ success: true, insights });
  } catch (error) {
    console.error('Error generating AI Insights:', error);
    return res.status(500).json({ success: false, message: 'Error generating insights', error: error.message });
  }
};
