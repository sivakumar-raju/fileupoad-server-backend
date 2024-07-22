const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const documentSchema = new Schema({
  mandatory: { type: Boolean, required: true },
  label: { type: String, required: true },
  files: [{ 
    fileName: String,
    fileSize: Number,
    fileType: String,
    file: Schema.Types.Mixed // or whatever type you decide for files
  }],
  approved: { type: Boolean, default: false },
  progress: { type: Number, default: 0 }
});

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;
