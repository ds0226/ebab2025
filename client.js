// client.js - Handles all client-side logic, including file upload and real-time read receipts.

const socket = io(); // Auto-connect to current host
let currentUser = null;
let pendingHistory = null;

// --- DOM Elements ---
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const selectionScreen = document.getElementById('initial-user-selection');
const chatContainer = document.getElementById('chat-container');
const currentUserDisplay = document.getElementById('my-user-id-display');
const otherUserStatus = document.getElementById('other-user-status');
const otherUserName = document.getElementById('other-user-name');
const photoInput = document.getElementById('photo-input');
const photoButton = document.getElementById('photo-button');


// --- Utility Functions ---

function getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

// --- Read Receipt Trigger (NEW) ---
function triggerReadReceipt(messageData) {
    // Only send a read receipt if:
    // 1. The message was NOT sent by the current user.
    // 2. The message has an ID (meaning it was loaded from history or saved by server).
    if (messageData.senderID !== currentUser && messageData._id) {
        socket.emit('message read', { 
            readerID: currentUser,
            messageID: messageData._id 
        });
    }
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
        const response = await fetch('/upload', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Upload failed with status: ' + response.status);
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


// --- Message Rendering Logic (UPDATED FOR STATUS) ---

function createMessageElement(messageData) {
    const senderKey = messageData.senderID || messageData.sender;
    const isMyMessage = senderKey === currentUser;
    const status = messageData.status || 'sent'; // Default status to 'sent' if missing

    const li = document.createElement('li');
    li.className = `message-bubble ${isMyMessage ? 'my-message' : 'their-message'}`;
    // Use the MongoDB ID to target for status updates later
    if(messageData._id) {
        li.dataset.id = messageData._id; 
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // --- Media/Text Content Rendering ---
    if (messageData.type === 'image') {
        const img = document.createElement('img');
        img.src = messageData.message; 
        // ... (styles)
        contentDiv.appendChild(img);
    } 
    // ... (logic for video and document remains the same)
    else if (messageData.type === 'video') {
        const video = document.createElement('video');
        video.src = messageData.message;
        video.controls = true;
        // ... (styles)
        contentDiv.appendChild(video);
    } else if (messageData.type === 'document') {
        const docLink = document.createElement('a');
        docLink.href = messageData.message;
        docLink.target = '_blank';
        docLink.textContent = `\ud83d\udcc4 Download File (${messageData.message.split('/').pop()})`; 
        // ... (styles)
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

    // --- Status Checkmarks (NEW LOGIC) ---
    if (isMyMessage) {
        const statusSpan = document.createElement('span');
        statusSpan.classList.add(`status-${status}`); 

        if (status === 'read') {
            statusSpan.innerHTML = '\u2713\u2713'; // Double checkmark
        } else {
            statusSpan.innerHTML = '\u2713';  // Single checkmark (Default for sent)
        }

        timeSpan.appendChild(statusSpan);
    }

    li.appendChild(timeSpan);

    return li;
}

function renderMessage(messageData) {
    messages.appendChild(createMessageElement(messageData));
    scrollToBottom();

    // CRITICAL: Trigger read receipt for incoming messages immediately after rendering
    triggerReadReceipt(messageData); 
}

// --- Socket.IO Event Listeners ---
socket.on('chat message', (msg) => {
    // Check if a list item with this ID already exists (prevents duplicates when sender receives own msg)
    if (!document.querySelector(`li[data-id="${msg._id}"]`)) {
        renderMessage(msg);
    }
});

socket.on('history', (messagesHistory) => {
    // Store history but don't render until user is selected
    pendingHistory = messagesHistory;
    console.log('History received but pending user selection:', messagesHistory.length, 'messages');
});

// --- Real-time Status Update Listener (NEW) ---
socket.on('message status update', (data) => {
    if (data.status === 'read') {
        const listItem = document.querySelector(`li[data-id="${data.messageID}"]`);

        if (listItem) {
            const statusSpan = listItem.querySelector('.message-time span');

            if (statusSpan && statusSpan.classList.contains('status-sent')) {
                statusSpan.classList.remove('status-sent');
                statusSpan.classList.add('status-read');
                statusSpan.innerHTML = '\u2713\u2713'; // Change single to double checkmark
            }
        }
    }
});


   



// --- Event Handlers ---

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value && currentUser) {
        const messageData = {
            senderID: currentUser, 
            message: input.value,
            type: 'text',
            status: 'sent', // Explicitly set status to sent
            timestamp: new Date().toISOString()
        };

        socket.emit('chat message', messageData);
        input.value = '';
    }
});

// --- User Selection Functionality ---
function setupUserSelection() {
    const userButtons = document.querySelectorAll('.user-buttons button');

    userButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedUser = button.getAttribute('data-user');
            selectUser(selectedUser);
        });
    });
}

function selectUser(userId) {
    currentUser = userId;

    // Tell the server which user we are
    socket.emit('select user', userId);
}

socket.on('user selected', (success) => {
    if (success) {
        selectionScreen.style.display = 'none';
        chatContainer.style.display = 'flex';
        currentUserDisplay.textContent = currentUser;
        
        // Set the other user's name
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        otherUserName.textContent = otherUser.toUpperCase();
        
        input.focus();

        // Render pending history now that we know who the current user is
        if (pendingHistory && pendingHistory.length > 0) {
            console.log('Rendering pending history for user:', currentUser);
            pendingHistory.forEach(renderMessage);
            pendingHistory = null; // Clear pending history
        }

        // Request latest presence data
        socket.emit('get presence update');
    } else {
        alert('This user is already taken. Please select the other user.');
    }
});

function updateOtherUserStatus() {
    // Logic to update the other user's status display
    socket.emit('get available users');
}

socket.on('available users', (inUseList) => {
    console.log('Available users:', inUseList);

    // Enable/disable buttons based on availability
    const userButtons = document.querySelectorAll('.user-buttons button');
    userButtons.forEach(button => {
        const userId = button.getAttribute('data-user');
        button.disabled = inUseList.includes(userId) && userId !== currentUser;
    });
});

// --- Enhanced Presence Update Handler ---
socket.on('presence update', (presenceData) => {
    console.log('Presence update received:', presenceData);

    if (currentUser) {
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        const otherUserStatus = document.getElementById('other-user-status');
        const otherPresence = presenceData[otherUser];

        if (otherPresence) {
            if (otherPresence.isOnline) {
                otherUserStatus.textContent = 'Online';
                otherUserStatus.className = 'status-online';
            } else {
                // Show detailed time ago information
                const timeAgo = otherPresence.timeAgo || 'Offline';
                otherUserStatus.textContent = `last seen ${timeAgo}`;
                otherUserStatus.className = 'status-offline';
            }
        }
    }

    // Update user selection buttons status
    const userButtons = document.querySelectorAll('.user-buttons button');
    userButtons.forEach(button => {
        const userId = button.getAttribute('data-user');
        const userPresence = presenceData[userId];

        if (userPresence && !userPresence.isOnline && userPresence.timeAgo) {
            // Update button text to show last seen time
            if (userId !== currentUser) {
                const originalText = button.getAttribute('data-original-text') || button.textContent;
                if (!button.getAttribute('data-original-text')) {
                    button.setAttribute('data-original-text', originalText);
                }
                button.textContent = `${originalText} (${userPresence.timeAgo})`;
            }
        }
    });
});

// Photo button click handler
photoButton.addEventListener('click', () => {
    photoInput.click();
});

// Initialize user selection when DOM is ready
document.addEventListener('DOMContentLoaded', setupUserSelection);