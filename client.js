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

let selectedMessages = [];
let pressTimer = null;
const LONG_PRESS_DURATION = 500; 

myUserIdDisplay.textContent = MY_USER_ID;

// ----------------------------------------------------------------------
// --- MESSAGE HELPER FUNCTION (With Status Logic RESTORED) ---
// ----------------------------------------------------------------------

// 💥 MODIFIED: Accepts 'status'
function addMessage(text, className, timestamp, messageId, status) { 
    const item = document.createElement('div');
    
    const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    
    // 💥 RESTORED: Status logic
    let statusIcon = '';
    if (className === 'my-message' && status) {
        if (status === 'read') {
            statusIcon = '<span class="status-read">✓✓</span>'; 
        } else if (status === 'delivered') {
            statusIcon = '<span class="status-delivered">✓✓</span>';
        } else {
            statusIcon = '<span class="status-sent">✓</span>';
        }
    }

    item.innerHTML = `
        <span class="message-text">${text}</span>
        <span class="message-time">${time} ${statusIcon}</span>
    `;
    
    item.classList.add('message-bubble', className);
    
    if (messageId) item.dataset.id = messageId;
    
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    
    if (className === 'my-message' && MY_USER_ID === 'x' && messageId) {
        setupLongPressHandler(item, messageId);
    }
    
    return item;
}

// ----------------------------------------------------------------------
// --- DELETE/SELECTION LOGIC (WhatsApp Style) ---
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
        headerBar.style.display = 'none';
        selectedCountSpan.textContent = `${count} selected`;
    } else {
        deleteActionBar.classList.remove('visible');
        headerBar.style.display = 'flex';
    }
}

function clearSelection() {
    document.querySelectorAll('.message-bubble.selected').forEach(el => el.classList.remove('selected'));
    selectedMessages = [];
    updateActionBar();
}

document.getElementById('delete-selected-btn').addEventListener('click', () => {
    if (selectedMessages.length > 0) {
        if (confirm(`Delete ${selectedMessages.length} message(s)?`)) {
            socket.emit('delete multiple messages', { messageIds: selectedMessages, senderId: MY_USER_ID });
        }
    }
});

document.getElementById('cancel-selection-btn').addEventListener('click', clearSelection);


function setupLongPressHandler(element, messageId) {
    const startPress = () => {
        if (!deleteActionBar.classList.contains('visible')) {
            pressTimer = setTimeout(() => {
                toggleSelection(element, messageId);
            }, LONG_PRESS_DURATION);
        }
    };

    const endPress = () => {
        clearTimeout(pressTimer);
        if (deleteActionBar.classList.contains('visible') && pressTimer !== null) {
            // Allow tap to select after action bar is visible
        }
        pressTimer = null;
    };
    
    element.addEventListener('click', (e) => {
        if (deleteActionBar.classList.contains('visible')) {
            e.preventDefault();
            toggleSelection(element, messageId);
        }
    });

    element.addEventListener('touchstart', startPress);
    element.addEventListener('touchend', endPress);
    element.addEventListener('touchcancel', () => clearTimeout(pressTimer));
}

// ----------------------------------------------------------------------
// --- USER ASSIGNMENT & STATUS LOGIC (Preserved) ---
// ----------------------------------------------------------------------

function formatLastSeen(timestamp) {
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

    const sendButton = form.querySelector('#send-button');
    
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
// --- REAL-TIME SEND/RECEIVE & STATUS UPDATE LOGIC ---
// ----------------------------------------------------------------------

form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (input.value && !form.querySelector('#send-button').disabled) {
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
        // 💥 MODIFIED: Pass status and _id
        addMessage(display_text, type, msg.timestamp, msg._id, msg.status); 
    });
});


socket.on('chat message', function(msgData) {
    const type = (msgData.sender === MY_USER_ID) ? 'my-message' : 'their-message';
    const display_text = (msgData.sender === MY_USER_ID) ? msgData.text : `${msgData.sender}: ${msgData.text}`;
    
    // 💥 MODIFIED: Pass status and _id
    addMessage(display_text, type, msgData.timestamp, msgData._id, msgData.status); 
    
    // 💥 RESTORED: If it's a message from the OTHER person, confirm delivery.
    if (type === 'their-message') {
        socket.emit('message delivered', { messageId: msgData._id });
        
        // Optional: Emit 'message read' when the user brings the window into focus
        // window.addEventListener('focus', () => socket.emit('message read', { messageId: msgData._id }));
    }
});

// 💥 RESTORED: Handler for status updates broadcast from server
socket.on('message status update', function(msgData) {
    // Find the message bubble in the DOM by its data-id attribute
    const messageElement = document.querySelector(`.message-bubble[data-id="${msgData._id}"]`);

    if (messageElement && msgData.sender === MY_USER_ID) {
        // Only update the status icon if it's MY message (I am the sender)
        const timeSpan = messageElement.querySelector('.message-time');
        
        if (timeSpan) {
            let statusIcon = '';
            if (msgData.status === 'read') {
                statusIcon = '<span class="status-read">✓✓</span>';
            } else if (msgData.status === 'delivered') {
                statusIcon = '<span class="status-delivered">✓✓</span>';
            } else {
                statusIcon = '<span class="status-sent">✓</span>'; 
            }
            
            // Re-render the time span with the new status icon
            const time = new Date(msgData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeSpan.innerHTML = `${time} ${statusIcon}`;
        }
    }
});


socket.on('message deleted', function(data) {
    if (data.messageIds) {
        data.messageIds.forEach(id => {
            const messageElement = document.querySelector(`.message-bubble[data-id="${id}"]`);
            if (messageElement) {
                messageElement.remove();
            }
        });
        clearSelection();
    }
});