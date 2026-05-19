const { GoogleGenAI } = require('@google/genai');
const { wrapSDK } = require('langsmith/wrappers');
const fs = require('fs');

// Initialize Gemini client using environment variable GEMINI_API_KEY
const baseAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const ai = wrapSDK(baseAi);

/**
 * Robust wrapper to call Gemini API with fallback models if the primary model hits a rate limit or error
 * @param {any} contents - Contents payload for generateContent
 * @returns {Promise<object>} - Gemini response object
 */
const generateContentWithFallback = async (contents) => {
  const models = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-flash-lite',
    'gemini-1.5-flash'
  ];

  let lastError;
  for (const model of models) {
    try {
      console.log(`[Gemini Service] Attempting generation with model: ${model}`);
      const response = await ai.models.generateContent({
        model: model,
        contents: contents
      });
      console.log(`[Gemini Service] Successfully generated content using model: ${model}`);
      return response;
    } catch (error) {
      console.warn(`[Gemini Service] Failed with model ${model}:`, error.message || error);
      lastError = error;
    }
  }
  throw lastError;
};

/**
 * Extracts structured expense data directly from receipt images using Multimodal Gemini AI
 * Bypasses the need for external OCR APIs, resolving billing and layout constraints
 * @param {string} imagePath - Absolute path to the receipt image file
 * @returns {Promise<object>} - Structured object: { shopName, amount, date, category }
 */
const parseBillImage = async (imagePath) => {
  try {
    const fileBuffer = fs.readFileSync(imagePath);
    const base64Data = fileBuffer.toString('base64');
    
    // Resolve mime-type based on file extension
    let mimeType = 'image/jpeg';
    const ext = imagePath.split('.').pop().toLowerCase();
    if (ext === 'png') {
      mimeType = 'image/png';
    } else if (ext === 'webp') {
      mimeType = 'image/webp';
    }

    const prompt = `
      You are an expert AI parser for bills, invoices, and receipts.
      Analyze the provided receipt/invoice image and extract:
      1. shopName (The name of the vendor, store, hospital, shop, restaurant, or business. Be precise. For example: "Jeevan Hospital" or "Starbucks Coffee")
      2. amount (The final total amount paid or payable as a number. Exclude currency symbols. Ensure you extract the final grand total.)
      3. date (The transaction date of the bill. Format as YYYY-MM-DD. If year is missing, assume the current year 2026. If date cannot be parsed, use today's date YYYY-MM-DD.)
      4. category (Classify the expense into one of these: "Food", "Travel", "Shopping", "Utilities", "Entertainment", "Health", "Housing", "Education", "Subscription", "Others".)

      Provide the output strictly as a JSON object with these keys: "shopName", "amount", "date", "category". Do not wrap the JSON output in markdown code blocks. Do not add any extra text, comments, or fields.
      
      Today's date is: ${new Date().toISOString().split('T')[0]}
    `;

    const response = await generateContentWithFallback([
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      },
      prompt
    ]);

    let resultText = response.text.trim();
    
    // Clean up potential markdown formatting
    if (resultText.startsWith('```json')) {
      resultText = resultText.substring(7, resultText.length - 3);
    } else if (resultText.startsWith('```')) {
      resultText = resultText.substring(3, resultText.length - 3);
    }
    resultText = resultText.trim();

    const parsedData = JSON.parse(resultText);

    return {
      shopName: parsedData.shopName || 'Unknown Shop',
      amount: parseFloat(parsedData.amount) || 0,
      date: parsedData.date ? new Date(parsedData.date) : new Date(),
      category: parsedData.category || 'Others'
    };
  } catch (error) {
    console.error('Error in Gemini Multimodal receipt parsing:', error);
    throw error;
  }
};

/**
 * Extracts structured expense data from OCR text using Gemini AI
 * @param {string} ocrText - The text extracted from the bill image
 * @returns {Promise<object>} - Structured object: { shopName, amount, date, category }
 */
const parseBillText = async (ocrText) => {
  try {
    const prompt = `
      You are an expert AI parser for bills and receipts. 
      Read the following raw OCR text extracted from an invoice/bill/receipt and extract:
      1. shopName (The name of the vendor, shop, restaurant, or business. Be precise.)
      2. amount (The total amount paid or payable as a number. Exclude currency symbols. Ensure you extract the final total amount.)
      3. date (The date of the bill. Format as YYYY-MM-DD. If year is missing, assume the current year 2026. If date cannot be parsed, use today's date YYYY-MM-DD.)
      4. category (Classify the expense into one of these: "Food", "Travel", "Shopping", "Utilities", "Entertainment", "Health", "Housing", "Education", "Subscription", "Others".)

      Provide the output strictly as a JSON object with these keys: "shopName", "amount", "date", "category". Do not wrap the JSON output in markdown code blocks. Do not add any extra text, comments, or fields.
      
      Today's date is: ${new Date().toISOString().split('T')[0]}

      OCR Text:
      """
      ${ocrText}
      """
    `;

    const response = await generateContentWithFallback(prompt);

    let resultText = response.text.trim();
    
    // Clean up potential markdown formatting if Gemini included it despite instructions
    if (resultText.startsWith('```json')) {
      resultText = resultText.substring(7, resultText.length - 3);
    } else if (resultText.startsWith('```')) {
      resultText = resultText.substring(3, resultText.length - 3);
    }
    resultText = resultText.trim();

    const parsedData = JSON.parse(resultText);

    // Validate and format response
    return {
      shopName: parsedData.shopName || 'Unknown Shop',
      amount: parseFloat(parsedData.amount) || 0,
      date: parsedData.date ? new Date(parsedData.date) : new Date(),
      category: parsedData.category || 'Others'
    };
  } catch (error) {
    console.error('Error in Gemini parsing service:', error);
    // Return fallback structured data in case of error
    return {
      shopName: 'Unknown Shop',
      amount: 0,
      date: new Date(),
      category: 'Others'
    };
  }
};

/**
 * Generates smart financial insights based on list of expenses
 * @param {Array} expenses - List of expense objects
 * @returns {Promise<string>} - Human readable insights text
 */
const generateInsights = async (expenses) => {
  try {
    if (!expenses || expenses.length === 0) {
      return "You don't have any expenses recorded yet. Start adding expenses or upload bill receipts to get smart AI insights!";
    }

    const prompt = `
      You are an expert financial AI advisor. Analyze the following user expense data and generate 2-3 concise, actionable, and smart insights/patterns in bullet points.
      Identify any high spending categories, sudden increases, or recommendations to save money.
      Keep it brief, engaging, and professional.

      User Expenses Data (JSON format):
      ${JSON.stringify(expenses, null, 2)}
    `;

    const response = await generateContentWithFallback(prompt);

    return response.text.trim();
  } catch (error) {
    console.error('Error generating insights with Gemini:', error);
    return 'Unable to generate spending insights at the moment. Please try again later.';
  }
};

module.exports = {
  parseBillImage,
  parseBillText,
  generateInsights
};
