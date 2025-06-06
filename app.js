require('dotenv').config();

// Import required modules
const express = require('express');
const connectDB = require('./config/mongodb');
const fileRoutes = require('./routes/fileRoutes');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDSu_oyPHxDpDzFzAETtQnvwsP1XyZB2IY",
    authDomain: "globalpad-2025.firebaseapp.com",
    projectId: "globalpad-2025",
    messagingSenderId: "362385770404",
    appId: "1:362385770404:web:c64c5fd5cc959f52b02331"
};

// Connect to MongoDB
connectDB();

// Use file routes
app.use('/api/files', fileRoutes);

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const isInitialized = true;

// Global state
let currentCode = null;
const MAX_CHARS = 500000;
let viewerUnsubscribe = null;
let lastSaveTimeout = null;
let currentUserId = null;

// DOM Elements
const elements = {
    homePage: document.getElementById('homePage'),
    editorPage: document.getElementById('editorPage'),
    codeInput: document.getElementById('codeInput'),
    noteContent: document.getElementById('noteContent'),
    openButton: document.getElementById('openButton'),
    currentViewers: document.getElementById('currentViewers'),
    charCount: document.getElementById('charCount'),
    messageContainer: document.getElementById('messageContainer'),
    fileInput: document.getElementById('fileInput'),
    uploadButton: document.getElementById('uploadButton'),
    fileList: document.getElementById('fileList')
};

// Initialize UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    validateElements();
    setupEventListeners();
    checkUrlCode();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (currentCode) {
        updateViewer(!document.hidden);
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (currentCode) {
        decrementViewers();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (!currentCode) return;

    // Save (Ctrl+S)
    if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveContent();
    }
    // Save & Close (Ctrl+Alt+S)
    else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAndClose();
    }
    // Refresh (Alt+F5)
    else if (e.altKey && e.key === 'F5') {
        e.preventDefault();
        refreshContent();
    }
    // Close (Esc)
    else if (e.key === 'Escape') {
        e.preventDefault();
        closeEditor();
    }
});

// Validate all elements exist
function validateElements() {
    Object.entries(elements).forEach(([key, element]) => {
        if (!element) {
            console.error(`Required element not found: ${key}`);
            showMessage(`Error: Required element "${key}" not found`, true);
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    elements.openButton?.addEventListener('click', handleOpenClick);
    elements.codeInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleOpenClick();
        }
    });
    elements.noteContent?.addEventListener('input', handleInput);
    elements.uploadButton?.addEventListener('click', handleFileUpload);
}

function handleInput(e) {
    const text = e.target.value;
    updateCharCount(text.length);
    
    if (text.length > MAX_CHARS) {
        e.target.value = text.slice(0, MAX_CHARS);
        showMessage('Maximum character limit reached', true);
        return;
    }
    
    // Auto-save after 1 second of no typing
    if (lastSaveTimeout) clearTimeout(lastSaveTimeout);
    lastSaveTimeout = setTimeout(() => saveContent(true), 1000);
}

function checkUrlCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code && elements.codeInput) {
        elements.codeInput.value = code;
        handleOpenClick();
    }
}

async function handleOpenClick() {
    if (!isInitialized) {
        showMessage('Still connecting to server...', 'info');
        return;
    }
    
    const code = elements.codeInput?.value.trim().toLowerCase();
    if (!code) {
        showMessage('Please enter a code', true);
        return;
    }

    try {
        currentCode = code;
        const doc = await db.collection('notes').doc(code).get();
        
        hideAllPages();
        elements.editorPage?.classList.remove('hidden');
        
        if (elements.noteContent) {
            elements.noteContent.value = doc.exists ? doc.data().content || '' : '';
            updateCharCount(elements.noteContent.value.length);
        }

        // Setup real-time viewers count
        setupViewersCount();
        
        // Load files for this note
        await loadFiles();
        
        showMessage(doc.exists ? 'Content loaded successfully' : 'Created new note with this code', 
                   doc.exists ? 'success' : 'info');
        
    } catch (error) {
        console.error('Error checking code:', error);
        showMessage('Error accessing the note: ' + error.message, true);
    }
}

// Setup real-time viewers count
function setupViewersCount() {
    if (viewerUnsubscribe) {
        viewerUnsubscribe();
    }
    
    const viewersRef = db.collection('viewers').doc(currentCode);
    
    // Update viewer count on page load/unload
    updateViewer(true);
    window.addEventListener('beforeunload', () => {
        updateViewer(false);
        return null;
    });
    
    // Listen for changes in viewer count
    viewerUnsubscribe = viewersRef.onSnapshot(doc => {
        const data = doc.data() || { count: 0 };
        if (elements.currentViewers) {
            elements.currentViewers.textContent = `Current Viewers: ${Math.max(0, data.count)}`;
        }
    });
}

// Update viewer count
async function updateViewer(isJoining) {
    if (!currentCode) return;
    
    const viewersRef = db.collection('viewers').doc(currentCode);
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(viewersRef);
            const currentCount = doc.exists ? doc.data().count || 0 : 0;
            const newCount = currentCount + (isJoining ? 1 : -1);
            transaction.set(viewersRef, { count: Math.max(0, newCount) });
        });
    } catch (error) {
        console.error('Error updating viewers:', error);
    }
}

function updateCharCount(count) {
    if (elements.charCount) {
        elements.charCount.textContent = `${count}/${MAX_CHARS}`;
    }
}

async function saveContent(silent = false) {
    if (!currentCode || !elements.noteContent) return;

    try {
        await db.collection('notes').doc(currentCode).set({
            content: elements.noteContent.value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        if (!silent) {
            showMessage('Saved successfully', 'success');
        }
    } catch (error) {
        console.error('Error saving:', error);
        showMessage('Error saving: ' + error.message, true);
    }
}

async function saveAndClose() {
    await saveContent();
    closeEditor();
}

async function refreshContent() {
    if (!currentCode) return;
    
    try {
        const doc = await db.collection('notes').doc(currentCode).get();
        if (doc.exists && elements.noteContent) {
            elements.noteContent.value = doc.data().content || '';
            updateCharCount(elements.noteContent.value.length);
            showMessage('Content refreshed', 'success');
        }
    } catch (error) {
        console.error('Error refreshing:', error);
        showMessage('Error refreshing: ' + error.message, true);
    }
}

function closeEditor() {
    if (viewerUnsubscribe) {
        viewerUnsubscribe();
        viewerUnsubscribe = null;
    }
    
    updateViewer(false);
    hideAllPages();
    elements.homePage?.classList.remove('hidden');
    
    if (elements.codeInput) {
        elements.codeInput.value = '';
    }
    if (elements.noteContent) {
        elements.noteContent.value = '';
    }
    updateCharCount(0);
    currentCode = null;
}

function hideAllPages() {
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
}

function showMessage(message, isError = false) {
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.textContent = message;
    messageContainer.className = isError ? 'error' : 'success';
    messageContainer.style.display = 'block';
    setTimeout(() => {
        messageContainer.style.display = 'none';
    }, 3000);
}

function createMessageContainer() {
    const container = document.createElement('div');
    container.id = 'messageContainer';
    document.body.appendChild(container);
    return container;
}

async function incrementViewers() {
    if (!currentCode) return;
    try {
        await db.collection('texts').doc(currentCode).update({
            viewers: firebase.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        console.error('Error incrementing viewers:', error);
    }
}

async function decrementViewers() {
    if (!currentCode) return;
    try {
        await db.collection('texts').doc(currentCode).update({
            viewers: firebase.firestore.FieldValue.increment(-1)
        });
    } catch (error) {
        console.error('Error decrementing viewers:', error);
    }
}

// File handling functions
async function handleFileUpload() {
    const files = elements.fileInput.files;
    if (!files.length) {
        showMessage('Please select files to upload', true);
        return;
    }

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/files/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (response.ok) {
                showMessage(`File ${file.name} uploaded successfully`, 'success');
                await loadFiles();
            } else {
                showMessage(`Failed to upload ${file.name}: ${result.message}`, true);
            }
        } catch (error) {
            console.error('Upload error:', error);
            showMessage(`Error uploading ${file.name}`, true);
        }
    }

    // Clear the file input
    elements.fileInput.value = '';
}

async function loadFiles() {
    if (!currentCode) return;

    try {
        const response = await fetch(`/api/files/user/${currentUserId}`);
        const files = await response.json();
        displayFiles(files);
    } catch (error) {
        console.error('Error loading files:', error);
        showMessage('Error loading files', true);
    }
}

function displayFiles(files) {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    if (files.length === 0) {
        fileList.innerHTML = '<p>No files uploaded yet</p>';
        return;
    }

    files.forEach(file => {
        const fileElement = document.createElement('div');
        fileElement.className = 'file-item';
        fileElement.innerHTML = `
            <div class="file-info">
                <span class="filename">${file.filename}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <div class="file-actions">
                <button onclick="downloadFile('${file.fileId}', '${file.filename}')">Download</button>
                <button onclick="deleteFile('${file.fileId}')" class="delete">Delete</button>
            </div>
        `;
        fileList.appendChild(fileElement);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function downloadFile(fileId, filename) {
    try {
        const response = await fetch(`/api/files/${fileId}`);
        if (!response.ok) throw new Error('Download failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Download error:', error);
        showMessage('Error downloading file', true);
    }
}

async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
        const response = await fetch(`/api/files/${fileId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Delete failed');

        showMessage('File deleted successfully', 'success');
        loadFiles();
    } catch (error) {
        console.error('Delete error:', error);
        showMessage('Error deleting file', true);
    }
}

// Login function
document.getElementById('loginButton').addEventListener('click', () => {
    const userId = document.getElementById('userIdInput').value.trim();
    if (userId) {
        currentUserId = userId;
        document.getElementById('userId').textContent = `User ID: ${userId}`;
        document.getElementById('homePage').classList.add('hidden');
        document.getElementById('filePage').classList.remove('hidden');
        loadFiles();
    } else {
        showMessage('Please enter a user ID', true);
    }
});

// Logout function
function logout() {
    currentUserId = null;
    document.getElementById('homePage').classList.remove('hidden');
    document.getElementById('filePage').classList.add('hidden');
    document.getElementById('userIdInput').value = '';
    document.getElementById('fileList').innerHTML = '';
}

// Make functions available globally
window.saveContent = saveContent;
window.saveAndClose = saveAndClose;
window.closeEditor = closeEditor;
window.refreshContent = refreshContent; 
window.closeEditor = closeEditor; 

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 