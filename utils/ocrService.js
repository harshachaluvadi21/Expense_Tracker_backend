const vision = require('@google-cloud/vision');
const path = require('path');

// Assuming GOOGLE_APPLICATION_CREDENTIALS environment variable is set
const client = new vision.ImageAnnotatorClient();

/**
 * Extracts text from an image using Google Cloud Vision API
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} - Extracted text
 */
const extractTextFromImage = async (imagePath) => {
  try {
    const [result] = await client.textDetection(imagePath);
    const detections = result.textAnnotations;
    
    if (!detections || detections.length === 0) {
      throw new Error('No text found in the image.');
    }

    // The first element contains the full extracted text
    return detections[0].description;
  } catch (error) {
    console.error('Error in OCR Service:', error);
    throw error;
  }
};

module.exports = {
  extractTextFromImage
};
