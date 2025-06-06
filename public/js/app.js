let currentUserId = null;
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://your-backend-url.com';

// Show message function
function showMessage(message, isError = false) {
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.textContent = message;
    messageContainer.className = isError ? 'error' : 'success';
    messageContainer.style.display = 'block';
    setTimeout(() => {
        messageContainer.style.display = 'none';
    }, 3000);
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

// Load files function
async function loadFiles() {
    try {
        const response = await fetch(`${API_URL}/api/files/user/${currentUserId}`);
        if (!response.ok) throw new Error('Failed to load files');
        const files = await response.json();
        displayFiles(files);
    } catch (error) {
        console.error('Error loading files:', error);
        showMessage('Error loading files', true);
    }
}

// Display files function
function displayFiles(files) {
    const fileList = document.getElementById('fileList');
    const emptyState = fileList.querySelector('.empty-state') || createEmptyState();

    if (files.length === 0) {
        fileList.innerHTML = '';
        emptyState.classList.remove('hidden');
        fileList.appendChild(emptyState);
        return;
    }

    emptyState.classList.add('hidden');
    fileList.innerHTML = '';
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

// Create empty state element
function createEmptyState() {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
        <span class="icon">📂</span>
        <p>No files uploaded yet</p>
    `;
    return emptyState;
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Setup drag and drop
function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.classList.add('highlight');
    }

    function unhighlight(e) {
        dropZone.classList.remove('highlight');
    }

    dropZone.addEventListener('drop', handleDrop, false);
}

// Handle file drop
function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

// Handle files
function handleFiles(files) {
    if (files.length === 0) {
        showMessage('Please select files to upload', true);
        return;
    }

    [...files].forEach(uploadFile);
}

// Upload file function
async function uploadFile(file) {
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        showMessage(`File ${file.name} is too large. Maximum size is 10MB`, true);
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', currentUserId);

    try {
        const response = await fetch(`${API_URL}/api/files/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        showMessage(`${file.name} uploaded successfully`);
        loadFiles(); // Refresh the file list
    } catch (error) {
        console.error('Upload error:', error);
        showMessage(`Error uploading ${file.name}`, true);
    }
}

// Download file function
async function downloadFile(fileId, filename) {
    try {
        const response = await fetch(`${API_URL}/api/files/${fileId}`);
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

// Delete file function
async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
        const response = await fetch(`${API_URL}/api/files/${fileId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Delete failed');

        showMessage('File deleted successfully');
        loadFiles(); // Refresh the file list
    } catch (error) {
        console.error('Delete error:', error);
        showMessage('Error deleting file', true);
    }
}

// Initialize drag and drop
setupDragAndDrop();

// Setup file input change handler
document.getElementById('fileInput').addEventListener('change', (e) => {
    handleFiles(e.target.files);
}); 