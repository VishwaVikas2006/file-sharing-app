// DOM Elements
const homePage = document.getElementById('homePage');
const filePage = document.getElementById('filePage');
const userIdInput = document.getElementById('userIdInput');
const loginButton = document.getElementById('loginButton');
const userIdDisplay = document.getElementById('userId');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const fileList = document.getElementById('fileList');
const messageContainer = document.getElementById('messageContainer');

// API Endpoints
const API_BASE_URL = window.location.origin;
const ENDPOINTS = {
    UPLOAD: `${API_BASE_URL}/api/upload`,
    FILES: `${API_BASE_URL}/api/files/user`,
    DOWNLOAD: `${API_BASE_URL}/api/download`,
    DELETE: `${API_BASE_URL}/api/delete`,
    SAVE: `${API_BASE_URL}/api/save`
};

// Current user state
let currentUserId = '';

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Check for stored user ID
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
        loginUser(storedUserId);
    }

    // Setup event listeners
    loginButton.addEventListener('click', handleLogin);
    userIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    
    // File upload listeners
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('drop', handleDrop);
});

// Login handling
async function handleLogin() {
    const userId = userIdInput.value.trim();
    if (userId) {
        loginUser(userId);
    } else {
        showMessage('Please enter a user ID', 'error');
    }
}

function loginUser(userId) {
    currentUserId = userId;
    localStorage.setItem('userId', userId);
    userIdDisplay.textContent = `User ID: ${userId}`;
    homePage.classList.add('hidden');
    filePage.classList.remove('hidden');
    loadFiles();
}

function logout() {
    currentUserId = '';
    localStorage.removeItem('userId');
    homePage.classList.remove('hidden');
    filePage.classList.add('hidden');
    userIdInput.value = '';
    fileList.innerHTML = '';
}

// File handling
async function loadFiles() {
    try {
        if (!currentUserId) {
            showMessage('Please log in first', 'error');
            return;
        }

        const response = await fetch(`${ENDPOINTS.FILES}/${currentUserId}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to load files');
        }
        
        displayFiles(data);
    } catch (error) {
        showMessage('Error loading files: ' + error.message, 'error');
        console.error('Error:', error);
    }
}

function displayFiles(files) {
    if (!files || !files.length) {
        fileList.innerHTML = `
            <div class="empty-state">
                <span class="icon">📂</span>
                <p>No files uploaded yet</p>
            </div>
        `;
        return;
    }

    fileList.innerHTML = files.map(file => `
        <div class="file-item">
            <div class="file-info">
                <span class="filename">${file.filename}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <div class="file-actions">
                ${file.contentType === 'application/pdf' ? 
                    `<button onclick="saveFile('${file.fileId}')" class="secondary-button">Save</button>` : ''}
                <button onclick="downloadFile('${file.fileId}')" class="secondary-button">Download</button>
                <button onclick="deleteFile('${file.fileId}')" class="secondary-button delete">Delete</button>
            </div>
        </div>
    `).join('');
}

// File upload handling
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = 'var(--primary-color)';
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = 'var(--border-color)';
    
    const files = e.dataTransfer.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

async function handleFiles(files) {
    for (const file of files) {
        if (!isValidFile(file)) {
            showMessage(`Invalid file type or size: ${file.name}`, 'error');
            continue;
        }

        try {
            await uploadFile(file);
            showMessage(`${file.name} uploaded successfully`, 'success');
        } catch (error) {
            showMessage(`Failed to upload ${file.name}: ${error.message}`, 'error');
            console.error('Upload error:', error);
        }
    }
    
    loadFiles();
    fileInput.value = '';
}

function isValidFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    
    return file.size <= maxSize && allowedTypes.includes(file.type);
}

async function uploadFile(file) {
    if (!currentUserId) {
        throw new Error('Please log in first');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', currentUserId);

    try {
        const response = await fetch(ENDPOINTS.UPLOAD, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Upload failed');
        }

        return data;
    } catch (error) {
        console.error('Upload error details:', error);
        throw error;
    }
}

// File actions
async function saveFile(fileId) {
    try {
        const response = await fetch(`${ENDPOINTS.SAVE}/${fileId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUserId })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Save failed');
        }

        showMessage('File saved successfully', 'success');
    } catch (error) {
        showMessage('Failed to save file: ' + error.message, 'error');
        console.error('Save error:', error);
    }
}

async function downloadFile(fileId) {
    try {
        const response = await fetch(`${ENDPOINTS.DOWNLOAD}/${fileId}`);
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Download failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition').split('filename=')[1].replace(/['"]/g, '');
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        showMessage('Failed to download file: ' + error.message, 'error');
        console.error('Download error:', error);
    }
}

async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
        const response = await fetch(`${ENDPOINTS.DELETE}/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUserId })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Delete failed');
        }
        
        showMessage('File deleted successfully', 'success');
        loadFiles();
    } catch (error) {
        showMessage('Failed to delete file: ' + error.message, 'error');
        console.error('Delete error:', error);
    }
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showMessage(message, type) {
    messageContainer.textContent = message;
    messageContainer.className = type;
    messageContainer.style.opacity = '1';
    
    setTimeout(() => {
        messageContainer.style.opacity = '0';
    }, 3000);
} 