const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Vishwa:Vishwa@cluster0.l82ddp2.mongodb.net/?retryWrites=true&w=majority';

// Basic request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Middleware
app.use(cors());
app.use(express.json());

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is running!' });
});

// Serve static files from the public directory
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('MongoDB Connected Successfully');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });

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

const upload = multer({ 
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

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

// API Routes
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const newFile = new File({
            filename: req.file.filename,
            contentType: req.file.contentType,
            size: req.file.size,
            fileId: req.file.id,
            userId: req.body.userId || 'anonymous',
            metadata: req.file.metadata
        });

        await newFile.save();
        res.status(201).json({ message: 'File uploaded successfully', file: newFile });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Error uploading file' });
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

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({ 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`MongoDB URI: ${MONGODB_URI.substring(0, 20)}...`);
}); 