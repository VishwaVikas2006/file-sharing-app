const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Vishwa:Vishwa@cluster0.l82ddp2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// GridFS Storage setup
const storage = new GridFsStorage({
  url: MONGODB_URI,
  file: (req, file) => {
    return {
      bucketName: 'uploads',
      filename: `${Date.now()}-${file.originalname}`,
      metadata: {
        userId: req.body.userId || 'anonymous',
        contentType: file.mimetype,
      }
    };
  }
});

const upload = multer({ storage });

// File Schema
const fileSchema = new mongoose.Schema({
  filename: String,
  contentType: String,
  size: Number,
  uploadDate: { type: Date, default: Date.now },
  fileId: mongoose.Schema.Types.ObjectId,
  userId: String,
  metadata: Object
});

const File = mongoose.model('File', fileSchema);

// Routes
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const newFile = new File({
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      fileId: req.file.id,
      userId: req.body.userId || 'anonymous',
      metadata: {
        userId: req.body.userId || 'anonymous',
        contentType: req.file.mimetype,
        originalName: req.file.originalname
      }
    });

    await newFile.save();
    res.status(201).json({ 
      message: 'File uploaded successfully', 
      file: {
        filename: newFile.filename,
        contentType: newFile.contentType,
        size: newFile.size,
        fileId: newFile.fileId,
        userId: newFile.userId
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Error uploading file: ' + error.message });
  }
});

app.get('/api/files/:fileId', async (req, res) => {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads'
    });

    const downloadStream = bucket.openDownloadStream(file.fileId);
    res.set('Content-Type', file.contentType);
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Error downloading file' });
  }
});

app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads'
    });

    await bucket.delete(file.fileId);
    await File.deleteOne({ _id: file._id });
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Error deleting file' });
  }
});

app.get('/api/files/user/:userId', async (req, res) => {
  try {
    const files = await File.find({ userId: req.params.userId });
    res.json(files);
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).json({ message: 'Error getting files' });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Handle all other routes by serving index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 