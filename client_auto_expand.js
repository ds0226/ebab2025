// client_auto_expand.js - Enhanced client with auto-expanding message input

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

// --- Auto-Expanding Input Functions ---
function autoExpandTextarea(textarea) {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate new height
    const newHeight = Math.min(textarea.scrollHeight, 120); // Max 120px height
    textarea.style.height = newHeight + 'px';
}

function setupAutoExpand() {
    // Convert input to textarea for multi-line support
    if (input.tagName === 'INPUT') {
        const textarea = document.createElement('textarea');
        textarea.id = 'input';
        textarea.placeholder = input.placeholder;
        textarea.className = input.className;
        textarea.setAttribute('autocomplete', 'off');
        textarea.setAttribute('autocorrect', 'off');
        textarea.setAttribute('autocapitalize', 'off');
        textarea.setAttribute('spellcheck', 'false');
        
        // Copy any existing styles
        const computedStyle = window.getComputedStyle(input);
        textarea.style.fontSize = computedStyle.fontSize;
        textarea.style.fontFamily = computedStyle.fontFamily;
        textarea.style.padding = computedStyle.padding;
        textarea.style.border = computedStyle.border;
        textarea.style.borderRadius = computedStyle.borderRadius;
        textarea.style.outline = computedStyle.outline;
        textarea.style.background = computedStyle.background;
        textarea.style.color = computedStyle.color;
        textarea.style.width = '100%';
        textarea.style.resize = 'none';
        textarea.style.overflowY = 'hidden';
        textarea.style.minHeight = computedStyle.height || '44px';
        textarea.style.maxHeight = '120px';
        textarea.style.lineHeight = '1.4';
        
        // Replace input with textarea
        input.parentNode.replaceChild(textarea, input);
        
        // Update reference
        window.input = textarea; // Global reference for other functions
        input = textarea;
    }
    
    // Add auto-expand listeners
    input.addEventListener('input', () => {
        autoExpandTextarea(input);
        adjustFormHeight();
    });
    
    input.addEventListener('focus', () => {
        autoExpandTextarea(input);
        adjustFormHeight();
    });
    
    input.addEventListener('blur', () => {
        // Reset height if empty
        if (input.value.trim() === '') {
            input.style.height = 'auto';
            adjustFormHeight();
        }
    });
    
    // Handle paste events
    input.addEventListener('paste', (e) => {
        setTimeout(() => {
            autoExpandTextarea(input);
            adjustFormHeight();
        }, 10);
    });
    
    // Handle Enter key for new line, Shift+Enter to send
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (!e.shiftKey) {
                e.preventDefault(); // Prevent new line
                // Send message
                if (input.value.trim()) {
                    form.dispatchEvent(new Event('submit'));
                }
            }
            // If Shift+Enter, allow new line
        }
        
        // Auto-expand on any input
        setTimeout(() => {
            autoExpandTextarea(input);
            adjustFormHeight();
        }, 10);
    });
}

function adjustFormHeight() {
    const inputHeight = input.offsetHeight;
    const minHeight = 44; // Minimum form height
    const maxHeight = 160; // Maximum form height (120px input + padding)
    const newHeight = Math.max(minHeight, Math.min(maxHeight, inputHeight + 20));
    form.style.height = newHeight + 'px';
}

function getCharacterCount() {
    return input.value.length;
}

function getLineCount() {
    return input.value.split('\n').length;
}

function updateCharacterCount() {
    const charCount = getCharacterCount();
    const lineCount = getLineCount();
    
    // Update character count display if element exists
    let charCounter = document.getElementById('char-counter');
    if (!charCounter) {
        charCounter = document.createElement('div');
        charCounter.id = 'char-counter';
        charCounter.className = 'char-counter';
        form.appendChild(charCounter);
    }
    
    // Show count if typing or over threshold
    if (charCount > 0 || lineCount > 1) {
        const maxLength = 2000; // WhatsApp-like limit
        charCounter.textContent = `${charCount}/${maxLength}`;
        charCounter.style.display = 'block';
        
        // Change color near limit
        if (charCount > maxLength * 0.9) {
            charCounter.style.color = '#dc3545';
        } else if (charCount > maxLength * 0.7) {
            charCounter.style.color = '#ffc107';
        } else {
            charCounter.style.color = '#667781';
        }
    } else {
        charCounter.style.display = 'none';
    }
}

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
    if (isIncoming && messageData._id && messageData.status !== 'read') {
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
    
    // Setup auto-expand after user selection
    setupAutoExpand();
    
    // Enhanced form handler
    form.addEventListener('submit', handleSubmit);
}

function handleSubmit(e) {
    e.preventDefault();
    if (input.value.trim() && currentUser && selectedUser) {
        const messageData = {
            senderID: currentUser,
            receiverID: selectedUser,
            text: input.value.trim(),
            timestamp: new Date().toISOString()
        };
        
        socket.emit('chat message', messageData);
        
        // Clear input and reset height
        input.value = '';
        input.style.height = 'auto';
        adjustFormHeight();
        updateCharacterCount();
        
        // Focus back to input
        input.focus();
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

// --- Character counter update on input ---
document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'input') {
        updateCharacterCount();
    }
});

console.log('🚀 Enhanced WhatsApp-style client with auto-expanding input initialized');