// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDSu_oyPHxDpDzFzAETtQnvwsP1XyZB2IY",
    authDomain: "globalpad-2025.firebaseapp.com",
    projectId: "globalpad-2025",
    messagingSenderId: "362385770404",
    appId: "1:362385770404:web:c64c5fd5cc959f52b02331"
};

// Global state
let isInitialized = false;
let currentCode = null;
const MAX_CHARS = 500000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
isInitialized = true;

// DOM Elements
const elements = {
    loginPage: document.querySelector('.login-card'),
    editorPage: document.getElementById('editorPage'),
    codeInput: document.getElementById('codeInput'),
    noteContent: document.getElementById('noteContent'),
    openButton: document.getElementById('openButton'),
    currentCount: document.getElementById('currentCount'),
    messageContainer: document.getElementById('messageContainer'),
    fileInput: document.getElementById('fileInput'),
    fileList: document.getElementById('fileList'),
    currentViewers: document.getElementById('currentViewers')
};

// Initialize UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    validateElements();
    setupEventListeners();
    checkUrlCode();
});

function validateElements() {
    Object.entries(elements).forEach(([key, element]) => {
        if (!element) {
            console.error(`Required element not found: ${key}`);
            showMessage(`Error: Required element "${key}" not found`, 'error');
        }
    });
}

function setupEventListeners() {
    elements.openButton?.addEventListener('click', handleOpenClick);
    elements.codeInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleOpenClick();
        }
    });
    elements.noteContent?.addEventListener('input', updateCharCount);
    elements.fileInput?.addEventListener('change', handleFileUpload);
}

function checkUrlCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code && elements.codeInput) {
        elements.codeInput.value = code;
        handleOpenClick();
    }
}

function handleOpenClick() {
    if (!isInitialized) {
        showMessage('Still connecting to server...', 'info');
        return;
    }
    checkCode();
}

async function checkCode() {
    if (!elements.codeInput) {
        showMessage('Error: Input element not found', 'error');
        return;
    }

    const code = elements.codeInput.value.trim().toLowerCase();
    if (!code) {
        showMessage('Please enter a code', 'error');
        return;
    }

    try {
        currentCode = code;
        const doc = await db.collection('texts').doc(code).get();
        
        hideAllPages();
        elements.editorPage?.classList.remove('hidden');
        
        if (doc.exists) {
            const data = doc.data();
            if (elements.noteContent) {
                elements.noteContent.value = data.text || '';
            }
            showMessage('Content loaded successfully', 'success');
            setupRealtimeListeners();
        } else {
            if (elements.noteContent) {
                elements.noteContent.value = '';
            }
            showMessage('Created new note with this code', 'info');
            await initializeDocument(code);
        }
        
        updateCharCount();
        updateViewersCount();
        
    } catch (error) {
        console.error('Error checking code:', error);
        showMessage('Error checking code: ' + error.message, 'error');
    }
}

async function initializeDocument(code) {
    try {
        await db.collection('texts').doc(code).set({
            text: '',
            viewers: 1,
            lastModified: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error initializing document:', error);
        showMessage('Error creating new document', 'error');
    }
}

function setupRealtimeListeners() {
    if (!currentCode) return;

    // Listen for text changes
    db.collection('texts').doc(currentCode)
        .onSnapshot((doc) => {
            if (doc.exists && elements.noteContent) {
                const data = doc.data();
                if (data.text !== elements.noteContent.value) {
                    elements.noteContent.value = data.text || '';
                    updateCharCount();
                }
            }
        });

    // Update viewers count
    updateViewersCount();
}

async function updateViewersCount() {
    if (!currentCode || !elements.currentViewers) return;

    try {
        const doc = await db.collection('texts').doc(currentCode).get();
        if (doc.exists) {
            const data = doc.data();
            elements.currentViewers.textContent = `Current Viewers: ${data.viewers || 1}`;
        }
    } catch (error) {
        console.error('Error updating viewers count:', error);
    }
}

async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || !currentCode) return;

    for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
            showMessage(`File ${file.name} is too large. Maximum size is 10MB`, 'error');
            continue;
        }

        const fileId = Date.now() + '_' + file.name;
        const storageRef = storage.ref(`files/${currentCode}/${fileId}`);
        
        try {
            // Create loading indicator
            const loadingItem = createLoadingItem(file.name);
            elements.fileList?.appendChild(loadingItem);

            // Upload file
            const snapshot = await storageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();

            // Create file item
            const fileItem = createFileItem(file.name, downloadURL);
            elements.fileList?.replaceChild(fileItem, loadingItem);

            showMessage(`File ${file.name} uploaded successfully`, 'success');
        } catch (error) {
            console.error('Error uploading file:', error);
            showMessage(`Error uploading ${file.name}: ${error.message}`, 'error');
            elements.fileList?.removeChild(loadingItem);
        }
    }

    // Clear file input
    event.target.value = '';
}

function createLoadingItem(fileName) {
    const div = document.createElement('div');
    div.className = 'file-item loading';
    div.innerHTML = `
        <span>${fileName}</span>
        <div class="progress-text">Uploading...</div>
    `;
    return div;
}

function createFileItem(fileName, url) {
    const div = document.createElement('div');
    div.className = 'file-item';
    
    const isImage = /\.(jpg|jpeg|png|gif)$/i.test(fileName);
    
    if (isImage) {
        div.innerHTML = `
            <img src="${url}" alt="${fileName}" loading="lazy">
            <span>${fileName}</span>
            <button onclick="this.parentElement.remove()" aria-label="Remove file">&times;</button>
        `;
    } else {
        div.innerHTML = `
            <a href="${url}" target="_blank">${fileName}</a>
            <button onclick="this.parentElement.remove()" aria-label="Remove file">&times;</button>
        `;
    }
    
    return div;
}

async function saveContent() {
    if (!currentCode || !elements.noteContent) return;

    try {
        const content = elements.noteContent.value;
        
        if (content.length > MAX_CHARS) {
            showMessage(`Maximum ${MAX_CHARS} characters allowed`, 'error');
            return;
        }

        await db.collection('texts').doc(currentCode).update({
            text: content,
            lastModified: firebase.firestore.FieldValue.serverTimestamp()
        });

        showMessage('Content saved successfully', 'success');
    } catch (error) {
        console.error('Error saving:', error);
        showMessage('Error saving content: ' + error.message, 'error');
    }
}

async function saveAndClose() {
    await saveContent();
    setTimeout(() => {
        closeEditor();
    }, 500);
}

function closeEditor() {
    if (!elements.loginPage || !elements.codeInput) return;
    
    hideAllPages();
    elements.loginPage.classList.remove('hidden');
    elements.codeInput.value = '';
    currentCode = null;
}

function hideAllPages() {
    elements.loginPage?.classList.add('hidden');
    elements.editorPage?.classList.add('hidden');
}

function updateCharCount() {
    if (!elements.noteContent || !elements.currentCount) return;
    const count = elements.noteContent.value.length;
    elements.currentCount.textContent = count.toString();
}

function showMessage(message, type = 'info') {
    if (!elements.messageContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    elements.messageContainer.innerHTML = '';
    elements.messageContainer.appendChild(messageDiv);
    
    if (type !== 'info') {
        setTimeout(() => {
            if (messageDiv.parentNode === elements.messageContainer) {
                elements.messageContainer.removeChild(messageDiv);
            }
        }, 3000);
    }
}

// Make functions available globally
window.saveContent = saveContent;
window.saveAndClose = saveAndClose;
window.closeEditor = closeEditor; 