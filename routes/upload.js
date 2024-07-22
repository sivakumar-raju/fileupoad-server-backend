const express = require('express');
const router = express.Router();
const Document = require('../models/documents'); // Adjust path as per your structure

// Create a new document
router.post('/documents', async (req, res) => {
  try {
    const newDocument = await Document.create(req.body);
    res.status(201).json(newDocument);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a document by ID
router.patch('/documents/:id', async (req, res) => {
  try {
    const updatedDocument = await Document.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedDocument) {
      return res.status(404).json({ message: 'Document not found' });
    }
    res.json(updatedDocument);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
