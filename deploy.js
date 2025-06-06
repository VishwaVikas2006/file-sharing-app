const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const { connectDB, getGfs } = require('./config/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Cache control middleware
const nocache = (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Expires', '-1');
    res.set('Pragma', 'no-cache');
    next();
};

app.use(nocache);

// Connect to MongoDB
connectDB().then(() => {
    console.log('Database connected successfully');
}).catch(err => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
});

// GridFS Storage setup
const storage = new GridFsStorage({
    url: process.env.MONGODB_URI,
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
    },
    fileFilter: (req, file, cb) => {
        // Accept images and PDFs only
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDF files are allowed!'), false);
        }
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
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        if (!req.body.userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const newFile = new File({
            filename: req.file.originalname,
            contentType: req.file.mimetype,
            size: req.file.size,
            fileId: req.file.id,
            userId: req.body.userId,
            metadata: {
                ...req.file.metadata,
                uploadedAt: new Date(),
                originalName: req.file.originalname
            }
        });

        await newFile.save();
        res.status(201).json({ 
            message: 'File uploaded successfully', 
            file: newFile 
        });
    } catch (error) {
        console.error('Upload error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Invalid file data' });
        }
        res.status(500).json({ message: 'Error uploading file' });
    }
});

app.get('/api/files/user/:userId', async (req, res) => {
    try {
        const files = await File.find({ userId: req.params.userId });
        res.json(files);
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({ message: 'Error fetching files' });
    }
});

app.get('/api/download/:fileId', async (req, res) => {
    try {
        const file = await File.findOne({ fileId: new mongoose.Types.ObjectId(req.params.fileId) });
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        const gfs = getGfs();
        if (!gfs) {
            return res.status(500).json({ message: 'File system not initialized' });
        }

        const downloadStream = gfs.openDownloadStream(new mongoose.Types.ObjectId(file.fileId));
        res.set('Content-Type', file.contentType);
        res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
        downloadStream.pipe(res);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ message: 'Error downloading file' });
    }
});

app.delete('/api/delete/:fileId', async (req, res) => {
    try {
        const file = await File.findOne({ fileId: new mongoose.Types.ObjectId(req.params.fileId) });
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        const gfs = getGfs();
        if (!gfs) {
            return res.status(500).json({ message: 'File system not initialized' });
        }

        await gfs.delete(new mongoose.Types.ObjectId(file.fileId));
        await File.deleteOne({ _id: file._id });
        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ message: 'Error deleting file' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 