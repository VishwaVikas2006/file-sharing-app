const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const crypto = require('crypto');
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

// Helper function to hash access code
function hashAccessCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Vishwa:Vishwa@cluster0.l82ddp2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Update allowed file types
const ALLOWED_FILE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
];

// GridFS Storage setup
const storage = new GridFsStorage({
    url: MONGODB_URI,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
                reject(new Error('Invalid file type. Only images, PDFs, DOCs, and TXT files are allowed.'));
                return;
            }

            const filename = `${Date.now()}-${file.originalname}`;
            const fileInfo = {
                filename: filename,
                bucketName: 'uploads',
                metadata: {
                    accessCode: hashAccessCode(req.body.accessCode),
                    contentType: file.mimetype,
                    originalName: file.originalname,
                    uploadedAt: new Date()
                }
            };
            resolve(fileInfo);
        });
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
    filename: {
        type: String,
        required: true
    },
    contentType: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    uploadDate: {
        type: Date,
        default: Date.now
    },
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    accessCode: {
        type: String,
        required: true
    },
    metadata: {
        type: Object,
        default: {}
    }
});

const File = mongoose.model('File', fileSchema);

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File is too large. Maximum size is 10MB' });
        }
        return res.status(400).json({ message: err.message });
    }
    
    if (err.message && err.message.includes('Invalid file type')) {
        return res.status(400).json({ message: err.message });
    }
    
    res.status(500).json({ message: 'Internal server error' });
};

app.use(errorHandler);

// Routes
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        if (!req.body.accessCode) {
            return res.status(400).json({ message: 'Access code is required' });
        }

        const hashedAccessCode = hashAccessCode(req.body.accessCode);

        const newFile = new File({
            filename: req.file.originalname,
            contentType: req.file.mimetype,
            size: req.file.size,
            fileId: req.file.id,
            accessCode: hashedAccessCode,
            metadata: {
                accessCode: hashedAccessCode,
                contentType: req.file.mimetype,
                originalName: req.file.originalname,
                uploadedAt: new Date()
            }
        });

        await newFile.save();
        res.status(201).json({ 
            message: 'File uploaded successfully', 
            file: {
                filename: newFile.filename,
                contentType: newFile.contentType,
                size: newFile.size,
                fileId: newFile.fileId
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Error uploading file: ' + error.message });
    }
});

app.get('/api/files/:fileId', async (req, res) => {
    try {
        const accessCode = req.query.accessCode;
        if (!accessCode) {
            return res.status(400).json({ message: 'Access code is required' });
        }

        const hashedAccessCode = hashAccessCode(accessCode);
        const file = await File.findOne({ 
            fileId: req.params.fileId,
            accessCode: hashedAccessCode 
        });

        if (!file) {
            return res.status(404).json({ message: 'File not found or access denied' });
        }

        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'uploads'
        });

        const downloadStream = bucket.openDownloadStream(file.fileId);
        res.set('Content-Type', file.contentType);
        res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
        downloadStream.pipe(res);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ message: 'Error downloading file' });
    }
});

app.delete('/api/files/:fileId', async (req, res) => {
    try {
        const accessCode = req.body.accessCode;
        if (!accessCode) {
            return res.status(400).json({ message: 'Access code is required' });
        }

        const hashedAccessCode = hashAccessCode(accessCode);
        const file = await File.findOne({ 
            fileId: req.params.fileId,
            accessCode: hashedAccessCode 
        });

        if (!file) {
            return res.status(404).json({ message: 'File not found or access denied' });
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

app.get('/api/files/access/:code', async (req, res) => {
    try {
        const hashedAccessCode = hashAccessCode(req.params.code);
        const files = await File.find({ accessCode: hashedAccessCode });
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
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 