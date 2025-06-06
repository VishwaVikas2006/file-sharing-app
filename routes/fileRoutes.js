const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const upload = require('../middleware/upload');
const File = require('../models/File');
const { ObjectId } = mongoose.Types;

let gfs;
mongoose.connection.once('open', () => {
  gfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'uploads'
  });
});

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const newFile = new File({
      filename: req.file.filename,
      contentType: req.file.contentType,
      size: req.file.size,
      fileId: req.file.id,
      userId: req.user ? req.user.uid : 'anonymous',
      metadata: req.file.metadata
    });

    await newFile.save();
    res.status(201).json({ 
      message: 'File uploaded successfully',
      file: newFile
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get file
router.get('/:fileId', async (req, res) => {
  try {
    const file = await File.findOne({ fileId: new ObjectId(req.params.fileId) });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const downloadStream = gfs.openDownloadStream(new ObjectId(req.params.fileId));
    downloadStream.pipe(res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete file
router.delete('/:fileId', async (req, res) => {
  try {
    const file = await File.findOne({ fileId: new ObjectId(req.params.fileId) });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    await gfs.delete(new ObjectId(req.params.fileId));
    await File.deleteOne({ _id: file._id });
    
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all files for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const files = await File.find({ userId: req.params.userId });
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 