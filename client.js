// client.js - Handles all client-side logic, including file upload and rendering.

const socket = io('https://ebab2025.onrender.com'); // CRITICAL: Use your deployed URL
let currentUser = null;
let selectedMessageId = null;

// --- DOM Elements ---
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendButton = document.getElementById('send-button');
const headerBar = document.getElementById('header-bar');
const currentUserDisplay = document.getElementById('my-user-id-display');
const otherUserStatus = document.getElementById('other-user-status');
const selectionScreen = document.getElementById('initial-user-selection');
const chatContainer = document.getElementById('chat-container'); // CRITICAL: Reference to the new wrapper
// File upload elements
const photoInput = document.getElementById('photo-input');
const photoButton = document.getElementById('photo-button'); 


// --- Utility Functions ---

function getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

// --- File Upload Logic ---

photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        uploadFile(file);
    }
    e.target.value = null; 
});

async function uploadFile(file) {
    if (!currentUser) return alert('Please select a user first.');
    
    chatContainer.style.cursor = 'progress'; 

    const formData = new FormData();
    formData.append('mediaFile', file); 

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed with status: ' + response.status);
        }

        const data = await response.json(); 

        const messageData = {
            senderID: currentUser,
            message: data.url,
            type: data.type,
            timestamp: new Date().toISOString()
        };
        socket.emit('chat message', messageData);

    } catch (error) {
        console.error('File upload failed:', error);
        alert('File upload failed. See console for details.');
    } finally {
        chatContainer.style.cursor = 'default';
    }
}


// --- Message Rendering Logic ---

function createMessageElement(messageData) {
    const senderKey = messageData.senderID || messageData.sender;
    const isMyMessage = senderKey === currentUser;

    const li = document.createElement('li');
    li.className = `message-bubble ${isMyMessage ? 'my-message' : 'their-message'}`;
    li.dataset.id = messageData._id;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // --- Media Rendering Logic ---
    if (messageData.type === 'image') {
        const img = document.createElement('img');
        img.src = messageData.message; 
        img.style.maxWidth = '250px'; 
        img.style.maxHeight = '250px';
        img.style.borderRadius = '8px';
        contentDiv.appendChild(img);

    } else if (messageData.type === 'video') {
        const video = document.createElement('video');
        video.src = messageData.message;
        video.controls = true; 
        video.style.maxWidth = '300px';
        video.style.maxHeight = '200px';
        video.style.borderRadius = '8px';
        contentDiv.appendChild(video);
        
    } else if (messageData.type === 'document') {
        const docLink = document.createElement('a');
        docLink.href = messageData.message;
        docLink.target = '_blank';
        docLink.textContent = `📄 Download File (${messageData.message.split('/').pop()})`; 
        docLink.style.color = isMyMessage ? '#E0E0E0' : '#4CAF50';
        docLink.style.textDecoration = 'underline';
        contentDiv.appendChild(docLink);
        
    } else {
        const textSpan = document.createElement('span');
        textSpan.className = 'message-text';
        textSpan.textContent = messageData.message;
        contentDiv.appendChild(textSpan);
    }
    
    li.appendChild(contentDiv); 

    // Time and Status Container
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = getCurrentTime(); 

    if (isMyMessage) {
        const statusSpan = document.createElement('span');
        statusSpan.classList.add('status-sent', 'status-read'); 
        statusSpan.innerHTML = '✓✓'; 
        timeSpan.appendChild(statusSpan);
    }

    li.appendChild(timeSpan);
    
    return li;
}

function renderMessage(messageData) {
    messages.appendChild(createMessageElement(messageData));
    scrollToBottom();
}

// --- Socket.IO Event Listeners ---
socket.on('chat message', (msg) => {
    const senderKey = msg.senderID || msg.sender;
    if (senderKey === currentUser || senderKey !== currentUser) {
        renderMessage(msg);
    }
});

socket.on('history', (messagesHistory) => {
    messagesHistory.forEach(renderMessage);
});

socket.on('available users', (inUseList) => {
    const iButton = document.querySelector('#initial-user-selection button[data-user="i"]');
    const xButton = document.querySelector('#initial-user-selection button[data-user="x"]');

    if (iButton) iButton.disabled = inUseList.includes('i');
    if (xButton) xButton.disabled = inUseList.includes('x');

    if (currentUser) {
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        const isOtherUserOnline = inUseList.includes(otherUser);
        
        otherUserStatus.textContent = isOtherUserOnline ? 'Online' : 'Recently online';
        otherUserStatus.className = isOtherUserOnline ? 'status-online' : 'status-offline';
    }
}); 

socket.on('user selected', (success) => {
    if (success) {
        // Hides selection screen
        selectionScreen.style.display = 'none';
        
        // CRITICAL FIX: Show the entire chat container, which contains messages, header, and form
        chatContainer.style.display = 'flex'; 
        
        currentUserDisplay.textContent = currentUser;
        input.focus();
    } else {
        if (currentUser) {
            alert('User is already selected by another client.');
        } 
        currentUser = null;
        document.querySelectorAll('#initial-user-selection button').forEach(btn => btn.disabled = false);
    }
});


// --- Initial Setup and Event Handlers ---

// Handle the chat message form submission (for text)
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value && currentUser) {
        const messageData = {
            senderID: currentUser, 
            message: input.value,
            type: 'text',
            timestamp: new Date().toISOString()
        };
        
        socket.emit('chat message', messageData);
        input.value = '';
    }
});

// Handle the initial user selection
document.querySelectorAll('#initial-user-selection button').forEach(button => {
    button.addEventListener('click', () => {
        const userId = button.dataset.user;
        
        currentUser = userId;
        document.querySelectorAll('#initial-user-selection button').forEach(btn => btn.disabled = true);

        socket.emit('select user', userId);
    });
});

// Attach event listener to the photo button
photoButton.addEventListener('click', () => {
    if (currentUser) {
        photoInput.click();
    } else {
        alert('Please select a user first to send files.');
    }
});