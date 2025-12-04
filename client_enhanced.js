// client_enhanced.js - Enhanced client with accurate timestamps and WhatsApp-style UI

const socket = io();

// DOM Elements
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const userButtons = document.getElementById('user-buttons');
const statusMessage = document.getElementById('status-message');
const currentUserDisplay = document.getElementById('my-user-id-display');
const otherUserStatus = document.getElementById('other-user-status');
const otherUserName = document.getElementById('other-user-name');

let currentUser = null;
let selectedUser = null;
let connectionStartTime = new Date();

// --- Enhanced Time Functions ---
function getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

function getClockTime(timestamp) {
    const d = timestamp ? new Date(timestamp) : new Date();
    return d.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
    });
}

function getFullDateTime(timestamp) {
    const d = timestamp ? new Date(timestamp) : new Date();
    return d.toLocaleString([], { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

function getTimeAgo(timestamp) {
    if (!timestamp) return null;
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffSeconds < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function getStatusTimestamp(messageData, status) {
    if (status === 'read' && messageData.readAt) {
        return `Read ${getTimeAgo(messageData.readAt)}`;
    } else if (status === 'delivered' && messageData.deliveredAt) {
        return `Delivered ${getTimeAgo(messageData.deliveredAt)}`;
    } else if (status === 'sent' && messageData.sentAt) {
        return `Sent ${getTimeAgo(messageData.sentAt)}`;
    }
    return status;
}

// --- Enhanced Message Element Creation ---
function createMessageElement(messageData) {
    const senderKey = messageData.senderID || messageData.sender;
    const isMyMessage = senderKey === currentUser;
    const status = messageData.status || 'sent';

    const li = document.createElement('li');
    li.className = `message-bubble ${isMyMessage ? 'my-message' : 'their-message'}`;
    li.setAttribute('data-id', messageData._id);

    // Message content container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'message-content';
    
    // Message text
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    textSpan.textContent = messageData.text;
    contentContainer.appendChild(textSpan);

    // Status container for my messages only
    if (isMyMessage) {
        const statusContainer = document.createElement('div');
        statusContainer.className = 'message-status-container';
        
        // WhatsApp-style check marks with colors
        const statusSpan = document.createElement('span');
        statusSpan.className = `message-status status-${status}`;
        statusSpan.setAttribute('title', getStatusTimestamp(messageData, status));
        
        if (status === 'read') {
            statusSpan.innerHTML = '✓✓'; // Double blue checkmark
            statusSpan.style.color = '#4FC3F7'; // Blue for read
        } else if (status === 'delivered') {
            statusSpan.innerHTML = '✓✓'; // Double grey checkmark
            statusSpan.style.color = '#9E9E9E'; // Grey for delivered
        } else {
            statusSpan.innerHTML = '✓'; // Single grey checkmark
            statusSpan.style.color = '#9E9E9E'; // Grey for sent
        }
        
        statusContainer.appendChild(statusSpan);
        contentContainer.appendChild(statusContainer);
    }

    li.appendChild(contentContainer);

    // Timestamp (below message)
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    
    const timeText = messageData.timestamp ? getClockTime(messageData.timestamp) : getCurrentTime();
    timeDiv.textContent = timeText;
    
    li.appendChild(timeDiv);

    // Add hover tooltip with full datetime
    li.setAttribute('title', getFullDateTime(messageData.timestamp));

    return li;
}

// --- Enhanced Message Display ---
function displayMessage(messageData) {
    const li = createMessageElement(messageData);
    messages.appendChild(li);
    scrollToBottom();

    // Set up read receipt observer for incoming messages
    const senderKey = messageData.senderID || messageData.sender;
    const isIncoming = senderKey !== currentUser;
    if (iscoming && messageData._id && messageData.status !== 'read') {
        const li = messages.querySelector(`li[data-id="${messageData._id}"]`);
        if (li) observeForRead(li, messageData);
    }
}

// --- Enhanced Status Update Handler ---
function updateMessageStatus(messageId, newStatus, messageData = null) {
    const listItem = messages.querySelector(`li[data-id="${messageId}"]`);
    
    if (!listItem) return;

    const statusSpan = listItem.querySelector('.message-status');
    if (!statusSpan) return;

    // Remove all status classes
    statusSpan.classList.remove('status-sent', 'status-delivered', 'status-read');
    statusSpan.classList.add(`status-${newStatus}`);

    // Update WhatsApp-style check marks
    if (newStatus === 'read') {
        statusSpan.innerHTML = '✓✓'; // Double blue checkmark
        statusSpan.style.color = '#4FC3F7'; // Blue
    } else if (newStatus === 'delivered') {
        statusSpan.innerHTML = '✓✓'; // Double grey checkmark
        statusSpan.style.color = '#9E9E9E'; // Grey
    } else {
        statusSpan.innerHTML = '✓'; // Single grey checkmark
        statusSpan.style.color = '#9E9E9E'; // Grey
    }

    // Update tooltip with accurate timestamp
    if (messageData) {
        const statusText = getStatusTimestamp(messageData, newStatus);
        statusSpan.setAttribute('title', statusText);
    }

    console.log(`✅ Message ${messageId} status updated to: ${newStatus}`);
}

// --- Enhanced Read Receipt Observer ---
function observeForRead(messageElement, messageData) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Mark as read when message is visible
                if (messageData._id && messageData.status !== 'read') {
                    socket.emit('message read', { messageID: messageData._id });
                    updateMessageStatus(messageData._id, 'read', {
                        ...messageData,
                        readAt: new Date().toISOString()
                    });
                    observer.unobserve(messageElement);
                }
            }
        });
    }, { threshold: 0.5 });

    observer.observe(messageElement);
}

// --- Socket Event Handlers ---
socket.on('chat message', (msg) => {
    displayMessage(msg);
});

socket.on('history', (historyMessages) => {
    historyMessages.forEach(msg => displayMessage(msg));
});

socket.on('message status update', (data) => {
    if (data.status) {
        updateMessageStatus(data.messageID, data.status, data);
    }
});

socket.on('message delivered', (data) => {
    updateMessageStatus(data.messageID, 'delivered', data);
});

// User selection handlers
document.querySelectorAll('.select-user').forEach(button => {
    button.addEventListener('click', () => {
        const userId = button.getAttribute('data-user');
        selectUser(userId);
    });
});

function selectUser(userId) {
    if (currentUser) return;
    
    currentUser = userId;
    selectedUser = userId === 'i' ? 'x' : 'i';
    
    socket.emit('select user', userId);
    
    document.getElementById('initial-user-selection').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    
    currentUserDisplay.textContent = `You are User ${currentUser.toUpperCase()}`;
    otherUserName.textContent = `User ${selectedUser.toUpperCase()}`;
    
    form.addEventListener('submit', handleSubmit);
}

function handleSubmit(e) {
    e.preventDefault();
    if (input.value && currentUser && selectedUser) {
        const messageData = {
            senderID: currentUser,
            receiverID: selectedUser,
            text: input.value,
            timestamp: new Date().toISOString()
        };
        
        socket.emit('chat message', messageData);
        input.value = '';
    }
}

function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

// --- Enhanced Status Indicators ---
function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.getElementById('status-indicator');
    
    if (isConnected) {
        statusElement.className = 'status-connected';
        statusText.textContent = 'Connected';
        statusIndicator.style.backgroundColor = '#4CAF50';
    } else {
        statusElement.className = 'status-disconnected';
        statusText.textContent = 'Connecting...';
        statusIndicator.style.backgroundColor = '#FF9800';
    }
}

// Connection status monitoring
socket.on('connect', () => {
    updateConnectionStatus(true);
    console.log('✅ Connected to server');
});

socket.on('disconnect', () => {
    updateConnectionStatus(false);
    console.log('❌ Disconnected from server');
});

// Initialize connection status
updateConnectionStatus(socket.connected);

// --- Enhanced Presence Updates ---
socket.on('presence update', (presenceData) => {
    if (selectedUser && presenceData[selectedUser]) {
        const user = presenceData[selectedUser];
        const statusElement = document.getElementById('other-user-status');
        
        if (user.isOnline) {
            statusElement.innerHTML = '<span class="status-dot online"></span>Online';
            statusElement.className = 'user-status online';
        } else {
            const lastSeen = user.lastSeen ? getTimeAgo(user.lastSeen) : 'Unknown';
            statusElement.innerHTML = `<span class="status-dot offline"></span>Last seen ${lastSeen}`;
            statusElement.className = 'user-status offline';
        }
    }
});

// --- Periodic Time Updates ---
setInterval(() => {
    document.querySelectorAll('.message-time').forEach((timeElement, index) => {
        const messageElement = timeElement.closest('.message-bubble');
        const messageId = messageElement.getAttribute('data-id');
        
        // Update time display for recent messages
        if (messageId) {
            // You could store message data and update times here
            // For now, keep static time display
        }
    });
}, 60000); // Update every minute

console.log('🚀 Enhanced WhatsApp-style client initialized');