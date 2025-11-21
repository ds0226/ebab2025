// ** CLIENT-SIDE FILE: client.js **

// ----------------------------------------------------------------------
// --- SOCKET.IO CONNECTION & SETUP ---
// ----------------------------------------------------------------------

const RENDER_LIVE_URL = 'https://ebab2025.onrender.com'; 
const socketUrl = (window.location.hostname === 'localhost') ? undefined : RENDER_LIVE_URL;
const socket = io(socketUrl, { transports: ['websocket'] }); 

// ----------------------------------------------------------------------
// --- USER & DOM ELEMENTS ---
// ----------------------------------------------------------------------

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const userSelector = document.getElementById('user-selector');
const otherUserStatusElement = document.getElementById('other-user-status');
// 💥 NEW DOM Elements
const myUserIdDisplay = document.getElementById('my-user-id-display');
const headerBar = document.getElementById('header-bar');
const deleteActionBar = document.createElement('div'); 
deleteActionBar.id = 'delete-action-bar';
deleteActionBar.innerHTML = `
    <span id="selected-count">0 selected</span>
    <button id="delete-selected-btn">Delete</button>
    <button id="cancel-selection-btn">X</button>
`;
document.body.appendChild(deleteActionBar); 

const ALL_USERS = ['x', 'i'];

let MY_USER_ID = userSelector ? userSelector.value : 'x'; 

// 💥 NEW: State for deletion logic
let selectedMessages = [];
let pressTimer = null;
const LONG_PRESS_DURATION = 500; // 500ms for long press

// Initialize header display
myUserIdDisplay.textContent = MY_USER_ID;

// ----------------------------------------------------------------------
// --- MESSAGE HELPER FUNCTION (Simplified for WhatsApp UI) ---
// ----------------------------------------------------------------------

function addMessage(text, className, timestamp, messageId) { 
    const item = document.createElement('div');
    
    const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    
    // We only include the text and the time/status. The delete action is now triggered by long-press/selection.
    item.innerHTML = `
        <span class="message-text">${text}</span>
        <span class="message-time">${time}</span>
    `;
    
    item.classList.add('message-bubble', className);
    
    if (messageId) item.dataset.id = messageId;
    
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    
    // 💥 NEW: Add long-press listeners for deletion if applicable
    if (className === 'my-message' && MY_USER_ID === 'x' && messageId) {
        setupLongPressHandler(item, messageId);
    }
    
    return item;
}

// ----------------------------------------------------------------------
// --- NEW DELETE/SELECTION LOGIC (WhatsApp Style) ---
// ----------------------------------------------------------------------

function toggleSelection(element, messageId) {
    if (element.classList.contains('selected')) {
        element.classList.remove('selected');
        selectedMessages = selectedMessages.filter(id => id !== messageId);
    } else {
        element.classList.add('selected');
        selectedMessages.push(messageId);
    }
    updateActionBar();
}

function updateActionBar() {
    const count = selectedMessages.length;
    const selectedCountSpan = document.getElementById('selected-count');
    
    if (count > 0) {
        deleteActionBar.classList.add('visible');
        headerBar.style.display = 'none'; // Hide normal header
        selectedCountSpan.textContent = `${count} selected`;
    } else {
        deleteActionBar.classList.remove('visible');
        headerBar.style.display = 'flex'; // Show normal header
    }
}

function clearSelection() {
    document.querySelectorAll('.message-bubble.selected').forEach(el => el.classList.remove('selected'));
    selectedMessages = [];
    updateActionBar();
}

// Event handlers for the action bar buttons
document.getElementById('delete-selected-btn').addEventListener('click', () => {
    if (selectedMessages.length > 0) {
        if (confirm(`Delete ${selectedMessages.length} message(s)?`)) {
            // Send ALL selected messages for deletion
            socket.emit('delete multiple messages', { messageIds: selectedMessages, senderId: MY_USER_ID });
            // The 'message deleted' handler will clear the selection
        }
    }
});

document.getElementById('cancel-selection-btn').addEventListener('click', clearSelection);


// Long-press detection function for mobile/touch
function setupLongPressHandler(element, messageId) {
    const startPress = () => {
        // Only allow long press if not already selecting messages
        if (!deleteActionBar.classList.contains('visible')) {
            pressTimer = setTimeout(() => {
                // Long press detected: toggle selection
                toggleSelection(element, messageId);
            }, LONG_PRESS_DURATION);
        }
    };

    const endPress = () => {
        clearTimeout(pressTimer);
        // If the action bar is visible (in selection mode), a quick tap should toggle selection
        if (deleteActionBar.classList.contains('visible') && pressTimer !== null) {
            // The click/touchend event will be handled by the click listener below
        }
        pressTimer = null;
    };
    
    // General click/tap logic: used for toggling selection once the action bar is visible
    element.addEventListener('click', (e) => {
        if (deleteActionBar.classList.contains('visible')) {
            e.preventDefault();
            toggleSelection(element, messageId);
        }
    });

    // Touch events for mobile long press
    element.addEventListener('touchstart', startPress);
    element.addEventListener('touchend', endPress);
    element.addEventListener('touchcancel', () => clearTimeout(pressTimer));
}

// ----------------------------------------------------------------------
// --- USER ASSIGNMENT & STATUS LOGIC (Preserved) ---
// ----------------------------------------------------------------------

function formatLastSeen(timestamp) {
    // ... (same as before) ...
    if (!timestamp) return 'Offline';
    const now = new Date();
    const lastSeen = new Date(timestamp);
    const diff = now - lastSeen;

    if (diff < 60000) {
        return 'Recently online';
    } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `Last seen ${minutes} min ago`;
    } else if (lastSeen.toDateString() === now.toDateString()) {
        return `Last seen today at ${lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return `Last seen ${lastSeen.toLocaleDateString()} at ${lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
}

function updateOtherUserStatus(statusMap) {
    const otherUserId = ALL_USERS.find(user => user !== MY_USER_ID);
    const otherUser = statusMap[otherUserId];

    if (!otherUser) {
        otherUserStatusElement.textContent = 'User unavailable';
        otherUserStatusElement.className = 'status-offline';
        return;
    }

    if (otherUser.online) {
        otherUserStatusElement.textContent = 'Online';
        otherUserStatusElement.className = 'status-online';
    } else {
        otherUserStatusElement.textContent = formatLastSeen(otherUser.lastSeen);
        otherUserStatusElement.className = 'status-offline';
    }
}

function requestUserId(userId) {
    socket.emit('set user', userId);
}

if (userSelector) {
    userSelector.addEventListener('change', function() {
        const newUserId = this.value;
        requestUserId(newUserId);
    });
}

socket.on('online-status-update', function(statusMap) {
    updateOtherUserStatus(statusMap);
});


socket.on('user-lock-status', function(activeUsersMap) {
    let claimedByUser = false;
    
    Array.from(userSelector.options).forEach(option => {
        const optionUserId = option.value;
        const isTaken = activeUsersMap.hasOwnProperty(optionUserId);
        
        if (isTaken && activeUsersMap[optionUserId] !== socket.id) {
            option.disabled = true;
            option.textContent = `${optionUserId} (TAKEN)`;
        } else {
            option.disabled = false;
            option.textContent = optionUserId;
        }

        if (optionUserId === userSelector.value && activeUsersMap[optionUserId] === socket.id) {
            claimedByUser = true;
        }
    });

    const sendButton = form.querySelector('button');
    
    if (!claimedByUser) {
        const availableOption = Array.from(userSelector.options).find(opt => !opt.disabled);
        
        if (availableOption) {
            userSelector.value = availableOption.value;
            MY_USER_ID = availableOption.value;
            myUserIdDisplay.textContent = MY_USER_ID; 
            requestUserId(MY_USER_ID);
            sendButton.disabled = false; 
            input.disabled = false;
        } else {
            sendButton.disabled = true;
            input.disabled = true;
        }
    } else {
        MY_USER_ID = userSelector.value;
        myUserIdDisplay.textContent = MY_USER_ID; 
        sendButton.disabled = false;
        input.disabled = false;
    }
});


socket.on('user taken', function(data) {
    alert(`User ID '${data.userId}' is currently being used by another user. Please select the other ID.`);
    
    const availableOption = Array.from(userSelector.options).find(opt => !opt.disabled);

    if (availableOption) {
        userSelector.value = availableOption.value; 
        MY_USER_ID = availableOption.value;
    }
});


socket.on('connect', () => {
    requestUserId(MY_USER_ID); 
});

// ----------------------------------------------------------------------
// --- REAL-TIME SEND/RECEIVE & DELETION LOGIC ---
// ----------------------------------------------------------------------

form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (input.value && !form.querySelector('button').disabled) {
        const msgData = {
            sender: MY_USER_ID,
            text: input.value
        };
        
        socket.emit('chat message', msgData);
        input.value = '';
    }
});


socket.on('history', function(messages) {
    document.getElementById('messages').innerHTML = ''; 
    messages.forEach(msg => {
        const type = (msg.sender === MY_USER_ID) ? 'my-message' : 'their-message';
        const display_text = (msg.sender === MY_USER_ID) ? msg.text : `${msg.sender}: ${msg.text}`;
        addMessage(display_text, type, msg.timestamp, msg._id); 
    });
});


socket.on('chat message', function(msgData) {
    const type = (msgData.sender === MY_USER_ID) ? 'my-message' : 'their-message';
    const display_text = (msgData.sender === MY_USER_ID) ? msgData.text : `${msgData.sender}: ${msgData.text}`;
    addMessage(display_text, type, msgData.timestamp, msgData._id); 
});

// 💥 MODIFIED: Handler for message deletion broadcast
socket.on('message deleted', function(data) {
    if (data.messageIds) {
        data.messageIds.forEach(id => {
            const messageElement = document.querySelector(`.message-bubble[data-id="${id}"]`);
            if (messageElement) {
                messageElement.remove();
            }
        });
        clearSelection(); // CRITICAL: Clear selection after removal
    }
});