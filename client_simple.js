// client_simple.js - Only delete message action

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

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: #2a3942;
        color: #e9edef;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 1000;
        animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// --- Simple Message Rendering with Delete Only ---
function createMessageElement(messageData) {
    const senderKey = messageData.senderID || messageData.sender;
    const isMyMessage = senderKey === currentUser;
    const status = messageData.status || 'sent';

    const li = document.createElement('li');
    li.className = `message-bubble ${isMyMessage ? 'my-message' : 'their-message'}`;
    if(messageData._id) {
        li.dataset.id = messageData._id; 
        li.dataset.messageId = messageData._id;
    }

    // Delete Button - ONLY for own messages
    if (isMyMessage) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '✕';
        deleteBtn.style.cssText = `
            position: absolute;
            top: -5px;
            right: -8px;
            opacity: 0;
            transition: opacity 0.2s ease;
            z-index: 15;
            background: rgba(255, 107, 107, 0.9);
            border: none;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: bold;
        `;
        deleteBtn.title = 'Delete message';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteMessage(messageData._id);
        };
        
        // Add hover effect
        li.addEventListener('mouseenter', () => {
            deleteBtn.style.opacity = '1';
        });
        li.addEventListener('mouseleave', () => {
            deleteBtn.style.opacity = '0';
        });
        
        li.appendChild(deleteBtn);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // --- Media/Text Content Rendering ---
    if (messageData.type === 'image') {
        const img = document.createElement('img');
        img.src = messageData.message; 
        img.style.cssText = 'max-width: 100%; height: auto; border-radius: 6px;';
        contentDiv.appendChild(img);
    } else if (messageData.type === 'video') {
        const video = document.createElement('video');
        video.src = messageData.message;
        video.controls = true;
        video.style.cssText = 'max-width: 100%; height: auto; border-radius: 6px;';
        contentDiv.appendChild(video);
    } else if (messageData.type === 'document') {
        const docLink = document.createElement('a');
        docLink.href = messageData.message;
        docLink.target = '_blank';
        docLink.textContent = `\ud83d\udcc4 Download File (${messageData.message.split('/').pop()})`; 
        docLink.style.cssText = 'color: #53bdeb; text-decoration: none;';
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

    // --- Status Checkmarks ---
    if (isMyMessage) {
        const statusSpan = document.createElement('span');
        statusSpan.classList.add(`status-${status}`); 

        if (status === 'read') {
            statusSpan.innerHTML = '\u2713\u2713';
        } else {
            statusSpan.innerHTML = '\u2713';
        }

        timeSpan.appendChild(statusSpan);
    }

    li.appendChild(timeSpan);

    return li;
}

function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        // Send delete request to server
        socket.emit('delete message', {
            messageId: messageId,
            senderID: currentUser
        });
        
        // Update UI immediately
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.style.opacity = '0.5';
            messageElement.style.pointerEvents = 'none';
            
            const contentDiv = messageElement.querySelector('.message-content');
            contentDiv.innerHTML = '<span style="color: #8696a0; font-style: italic;">This message was deleted</span>';
            
            const deleteBtn = messageElement.querySelector('.delete-btn');
            if (deleteBtn) deleteBtn.remove();
        }
        
        showNotification('Message deleted ✓');
    }
}

function renderMessage(messageData) {
    messages.appendChild(createMessageElement(messageData));
    scrollToBottom();
}

// --- Socket.IO Event Listeners ---
socket.on('chat message', (msg) => {
    if (!document.querySelector(`li[data-id="${msg._id}"]`)) {
        renderMessage(msg);
    }
});

socket.on('history', (messagesHistory) => {
    pendingHistory = messagesHistory;
    console.log('History received but pending user selection:', messagesHistory.length, 'messages');
});

socket.on('message status update', (data) => {
    if (data.status === 'read') {
        const listItem = document.querySelector(`li[data-id="${data.messageID}"]`);

        if (listItem) {
            const statusSpan = listItem.querySelector('.message-time span');

            if (statusSpan && statusSpan.classList.contains('status-sent')) {
                statusSpan.classList.remove('status-sent');
                statusSpan.classList.add('status-read');
                statusSpan.innerHTML = '\u2713\u2713';
            }
        }
    }
});

socket.on('message deleted', (data) => {
    console.log('Message deleted:', data);
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        messageElement.style.opacity = '0.5';
        messageElement.style.pointerEvents = 'none';
        
        const contentDiv = messageElement.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML = '<span style="color: #8696a0; font-style: italic;">This message was deleted</span>';
        }
        
        const deleteBtn = messageElement.querySelector('.delete-btn');
        if (deleteBtn) deleteBtn.remove();
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
            status: 'sent',
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

    socket.emit('select user', userId);
}

socket.on('user selected', (success) => {
    if (success) {
        selectionScreen.style.display = 'none';
        chatContainer.style.display = 'flex';
        currentUserDisplay.textContent = currentUser;
        
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        otherUserName.textContent = otherUser.toUpperCase();
        
        input.focus();

        if (pendingHistory && pendingHistory.length > 0) {
            console.log('Rendering pending history for user:', currentUser);
            pendingHistory.forEach(renderMessage);
            pendingHistory = null;
        }

        socket.emit('get presence update');
    } else {
        alert('This user is already taken. Please select the other user.');
    }
});

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
                const timeAgo = otherPresence.timeAgo || 'Offline';
                otherUserStatus.textContent = `last seen ${timeAgo}`;
                otherUserStatus.className = 'status-offline';
            }
        }
    }
});

photoButton.addEventListener('click', () => {
    photoInput.click();
});

document.addEventListener('DOMContentLoaded', setupUserSelection);