// client.js - Handles all client-side logic, including file upload and real-time read receipts.

const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ["websocket", "polling"]
}); // Auto-connect with robust reconnection
let currentUser = null;
let pendingHistory = null;
let latestPresenceData = null;
let presenceTickerId = null;
let localOfflineStart = {};
const OFFLINE_KEY_PREFIX = 'offlineStart_';
const SELECTED_USER_KEY = 'selectedUser';
let lastActivityTs = Date.now();

function getStoredOfflineStart(uid) {
    try {
        return localStorage.getItem(OFFLINE_KEY_PREFIX + uid);
    } catch (_) {
        return null;
    }
}

function setStoredOfflineStart(uid, ts) {
    try {
        localStorage.setItem(OFFLINE_KEY_PREFIX + uid, ts);
    } catch (_) {}
}

function clearStoredOfflineStart(uid) {
    try {
        localStorage.removeItem(OFFLINE_KEY_PREFIX + uid);
    } catch (_) {}
}

// --- DOM Elements ---
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendButton = document.getElementById('send-button');
const selectionScreen = document.getElementById('initial-user-selection');
const chatContainer = document.getElementById('chat-container');
const currentUserDisplay = document.getElementById('my-user-id-display');
const otherUserStatus = document.getElementById('other-user-status');
const otherUserName = document.getElementById('other-user-name');
const photoInput = document.getElementById('photo-input');
const photoButton = document.getElementById('photo-button');
let typingTimeout = null;
let lastInputHeightPx = null;


// --- Utility Functions ---

function getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getClockTime(timestamp) {
    const d = timestamp ? new Date(timestamp) : new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function scrollToBottom() {
    const threshold = 80;
    const distance = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
    if (distance < threshold) {
        messages.scrollTop = messages.scrollHeight;
    }
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
    if (diffSeconds < 30) return 'just now';
    if (diffSeconds < 60) return 'less than a minute ago';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function getOfflineDuration(timestamp) {
    if (!timestamp) return null;
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return '<1m';
    if (days >= 1) {
        const remHours = hours % 24;
        return remHours ? `${days}d ${remHours}h` : `${days}d`;
    }
    if (hours >= 1) {
        const remMins = mins % 60;
        return remMins ? `${hours}h ${remMins}m` : `${hours}h`;
    }
    return `${mins}m`;
}

function updatePresenceDisplays() {
    if (!latestPresenceData) return;
    if (currentUser) {
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        const otherPresence = latestPresenceData[otherUser];
        if (otherPresence) {
            if (otherPresence.isOnline) {
                otherUserStatus.textContent = 'Online';
                otherUserStatus.className = 'status-online';
            } else {
                if (!otherPresence.lastSeen && !localOfflineStart[otherUser]) {
                    localOfflineStart[otherUser] = new Date().toISOString();
                }
                const fallbackTs = otherPresence.lastSeen || localOfflineStart[otherUser];
                const durationText = getOfflineDuration(fallbackTs) || 'unknown';
                otherUserStatus.textContent = `Offline ${durationText}`;
                otherUserStatus.className = 'status-offline';
            }
        }
    }

    const userButtons = document.querySelectorAll('.user-buttons button');
    userButtons.forEach(button => {
        const userId = button.getAttribute('data-user');
        const userPresence = latestPresenceData[userId];
        if (userPresence && !userPresence.isOnline) {
            const originalText = button.getAttribute('data-original-text') || button.textContent;
            if (!button.getAttribute('data-original-text')) {
                button.setAttribute('data-original-text', originalText);
            }
            if (!userPresence.lastSeen && !localOfflineStart[userId]) {
                localOfflineStart[userId] = new Date().toISOString();
            }
            const fallbackTsBtn = userPresence.lastSeen || localOfflineStart[userId];
            const durationTextBtn = getOfflineDuration(fallbackTsBtn) || 'unknown';
            if (userId !== currentUser) {
                button.textContent = `${originalText} (offline ${durationTextBtn})`;
            }
        }
        if (userPresence && userPresence.isOnline) {
            const originalText = button.getAttribute('data-original-text') || button.textContent;
            button.textContent = originalText;
        }
    });
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
if (photoInput) {
    photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadFile(file);
        }
        e.target.value = null;
    });
}

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
    if (messageData._id) {
        li.dataset.id = String(messageData._id);
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
        const msg = String(messageData.message || '');
        const frag = document.createDocumentFragment();
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        let lastIndex = 0;
        let match;
        while ((match = urlRegex.exec(msg)) !== null) {
            const url = match[1];
            if (match.index > lastIndex) frag.appendChild(document.createTextNode(msg.slice(lastIndex, match.index)));
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = url;
            frag.appendChild(a);
            lastIndex = match.index + url.length;
        }
        if (lastIndex < msg.length) frag.appendChild(document.createTextNode(msg.slice(lastIndex)));
        textSpan.appendChild(frag);
        contentDiv.appendChild(textSpan);
    }

    li.appendChild(contentDiv); 

    // Time and Status Container
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    const timeTextSpan = document.createElement('span');
    timeTextSpan.className = 'time-text';
    const ts = messageData.timestamp || new Date().toISOString();
    timeTextSpan.textContent = getClockTime(ts);
    timeSpan.appendChild(timeTextSpan);

    // --- Status Checkmarks (NEW LOGIC) ---
    if (isMyMessage) {
        const statusSpan = document.createElement('span');
        statusSpan.classList.add(`status-${status}`); 

        if (status === 'read') {
            statusSpan.innerHTML = '\u2713\u2713'; // Double checkmark
        } else if (status === 'delivered') {
            statusSpan.innerHTML = '\u2713\u2713'; // Double grey checks for delivered
        } else {
            statusSpan.innerHTML = '\u2713';  // Single checkmark (Default for sent)
        }

        timeSpan.appendChild(statusSpan);
    }

    li.appendChild(timeSpan);
    
    li.dataset.timestamp = ts;

    return li;
}

function renderMessage(messageData) {
    messages.appendChild(createMessageElement(messageData));
    scrollToBottom();
    const senderKey = messageData.senderID || messageData.sender;
    const isIncoming = senderKey !== currentUser;
    if (isIncoming && messageData._id && messageData.status !== 'read') {
        const li = messages.querySelector(`li[data-id="${messageData._id}"]`);
        if (li) observeForRead(li, messageData);
    }
}

// --- Socket.IO Event Listeners ---
socket.on('chat message', (msg) => {
    // Check if a list item with this ID already exists (prevents duplicates when sender receives own msg)
    if (!document.querySelector(`li[data-id="${String(msg._id)}"]`)) {
        renderMessage(msg);
    }
    lastActivityTs = Date.now();
    // Immediate presence reflection for other user activity
    if (currentUser) {
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        if ((msg.senderID || msg.sender) === otherUser) {
            otherUserStatus.textContent = 'Online';
            otherUserStatus.className = 'status-online';
            clearStoredOfflineStart(otherUser);
            delete localOfflineStart[otherUser];
            // Receiver acknowledges delivery once bubble is rendered
            if (msg._id) {
                socket.emit('message delivered', {
                    messageID: msg._id,
                    senderID: msg.senderID || msg.sender
                });
            }
        }
    }
});

socket.on('history', (messagesHistory) => {
    if (!currentUser) {
        pendingHistory = messagesHistory;
        console.log('History received but pending user selection:', messagesHistory.length, 'messages');
        return;
    }
    lastActivityTs = Date.now();
    messagesHistory.forEach(msg => {
        if (!document.querySelector(`li[data-id="${msg._id}"]`)) {
            renderMessage(msg);
        }
        const isIncoming = (msg.senderID || msg.sender) !== currentUser;
        if (isIncoming && msg.status === 'sent' && msg._id) {
            socket.emit('message delivered', {
                messageID: msg._id,
                senderID: msg.senderID || msg.sender
            });
        }
    });
});

// --- Real-time Status Update Listener (NEW) ---
socket.on('message status update', (data) => {
    if (data.status === 'read') {
        const listItem = document.querySelector(`li[data-id="${data.messageID}"]`);

        if (listItem) {
            const statusSpan = listItem.querySelector('.message-time .status-sent, .message-time .status-delivered');
            if (statusSpan) {
                statusSpan.classList.remove('status-sent');
                statusSpan.classList.remove('status-delivered');
                statusSpan.classList.add('status-read');
                statusSpan.innerHTML = '\u2713\u2713';
            }
        }
    }
});

// Delivered update (receiver online)
socket.on('message delivered', (data) => {
    const listItem = document.querySelector(`li[data-id="${String(data.messageID)}"]`);
    if (listItem) {
        const statusSpan = listItem.querySelector('.message-time .status-sent') || listItem.querySelector('.message-time .status-delivered');
        if (statusSpan) {
            statusSpan.classList.remove('status-sent');
            statusSpan.classList.add('status-delivered');
            statusSpan.innerHTML = '\u2713\u2713'; // Double grey checks
        }
    }
});


   



// --- Event Handlers ---

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim() && currentUser) {
        const messageData = {
            senderID: currentUser, 
            message: input.value,
            type: 'text',
            status: 'sent', // Explicitly set status to sent
            timestamp: new Date().toISOString()
        };

        socket.emit('chat message', messageData);
        input.value = '';
        if (lastInputHeightPx) {
            input.style.height = lastInputHeightPx;
        }
        if (sendButton) sendButton.disabled = true;
        input.focus();
    }
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim()) {
            form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    }
});

input.addEventListener('input', () => {
    input.style.height = 'auto';
    const maxH = 160;
    input.style.height = Math.min(input.scrollHeight, maxH) + 'px';
    lastInputHeightPx = input.style.height;
    if (sendButton) sendButton.disabled = input.value.trim().length === 0;
    if (currentUser) {
        socket.emit('typing', { userID: currentUser, isTyping: true });
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('typing', { userID: currentUser, isTyping: false });
        }, 1200);
    }
});

input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim()) {
            form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
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
        setStoredSelectedUser(currentUser);
        
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
        clearStoredSelectedUser();
        selectionScreen.style.display = 'flex';
        chatContainer.style.display = 'none';
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

socket.on('typing', (data) => {
    if (!currentUser) return;
    const otherUser = currentUser === 'i' ? 'x' : 'i';
    if (data.userID === otherUser) {
        if (data.isTyping) {
            otherUserStatus.textContent = 'Typing…';
            otherUserStatus.className = 'status-typing';
        } else {
            updatePresenceDisplays();
        }
    }
});

// --- Enhanced Presence Update Handler ---
socket.on('presence update', (presenceData) => {
    console.log('Presence update received:', presenceData);
    latestPresenceData = presenceData;
    for (const uid in presenceData) {
        const p = presenceData[uid];
        if (p.isOnline) {
            delete localOfflineStart[uid];
            clearStoredOfflineStart(uid);
        } else {
            const stored = getStoredOfflineStart(uid);
            const ts = p.lastSeen || localOfflineStart[uid] || stored || new Date().toISOString();
            localOfflineStart[uid] = ts;
            setStoredOfflineStart(uid, ts);
        }
    }
    updatePresenceDisplays();
    lastActivityTs = Date.now();
    if (!presenceTickerId) {
        presenceTickerId = setInterval(() => {
            updatePresenceDisplays();
            updateMessageTimestamps();
            socket.emit('get presence update');
            socket.emit('get history');
        }, 15000);
    }
});

// Photo button click handler
if (photoButton && photoInput) {
    photoButton.addEventListener('click', () => {
        photoInput.click();
    });
}

// Initialize user selection when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    ['i','x'].forEach(uid => {
        const stored = getStoredOfflineStart(uid);
        if (stored) localOfflineStart[uid] = stored;
    });
    setupUserSelection();
    const storedUser = getStoredSelectedUser();
    if (storedUser) {
        currentUser = storedUser;
        selectionScreen.style.display = 'none';
        chatContainer.style.display = 'flex';
        currentUserDisplay.textContent = currentUser;
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        otherUserName.textContent = otherUser.toUpperCase();
        socket.emit('select user', currentUser);
        socket.emit('get presence update');
        socket.emit('get history');
    }
    if (!presenceTickerId) {
        presenceTickerId = setInterval(() => {
            updatePresenceDisplays();
            updateMessageTimestamps();
            socket.emit('get presence update');
            socket.emit('get history');
        }, 15000);
    }
    startRefreshWatchdog();
});

function startRefreshWatchdog() {
    setInterval(() => {
        const disconnected = socket.disconnected;
        const stale = Date.now() - lastActivityTs > 120000; // >2 minutes without activity
        if (disconnected) {
            try { socket.connect(); } catch (_) {}
        }
        if (stale) {
            socket.emit('get presence update');
            socket.emit('get history');
            updatePresenceDisplays();
            updateMessageTimestamps();
        }
    }, 30000);
}

function observeForRead(li, messageData) {
    const id = messageData._id;
    if (!id) return;
    if (li.dataset.readObserved === '1') return;
    const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                socket.emit('message read', { readerID: currentUser, messageID: id });
                io.disconnect();
                li.dataset.readObserved = '1';
            }
        });
    }, { threshold: 0.6 });
    io.observe(li);
}

// --- Timestamp Ticker for Message Bubbles ---
function updateMessageTimestamps() {
    const items = document.querySelectorAll('li.message-bubble');
    items.forEach(li => {
        const ts = li.dataset.timestamp;
        const timeTextEl = li.querySelector('.message-time .time-text');
        if (ts && timeTextEl) {
            timeTextEl.textContent = getClockTime(ts);
        }
    });
}
function getStoredSelectedUser() {
    try {
        return localStorage.getItem(SELECTED_USER_KEY);
    } catch (_) { return null; }
}

function setStoredSelectedUser(uid) {
    try { localStorage.setItem(SELECTED_USER_KEY, uid); } catch (_) {}
}

function clearStoredSelectedUser() {
    try { localStorage.removeItem(SELECTED_USER_KEY); } catch (_) {}
}
