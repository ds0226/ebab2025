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
const otherUserStatusElement = document.getElementById('other-user-status'); 
const myUserIdDisplay = document.getElementById('my-user-id-display');
const headerBar = document.getElementById('header-bar');

// New DOM references for photo/video upload
const fileInput = document.getElementById('file-input');
const photoButton = document.getElementById('photo-button');


// Selection UI Elements
const initialSelectionArea = document.getElementById('initial-user-selection');
const selectUserXBtn = document.getElementById('select-user-x');
const selectUserIBtn = document.getElementById('select-user-i');


// Delete Action Bar (Created dynamically and appended to body)
const deleteActionBar = document.createElement('div'); 
deleteActionBar.id = 'delete-action-bar';
deleteActionBar.innerHTML = `
    <span id="selected-count">0 selected</span>
    <button id="delete-selected-btn">Delete</button>
    <button id="cancel-selection-btn">X</button>
`;
document.body.appendChild(deleteActionBar); 

const ALL_USERS = ['x', 'i'];

let MY_USER_ID = null; 
let selectionMade = false; 

let selectedMessages = [];
let pressTimer = null;
const LONG_PRESS_DURATION = 500; 


// ----------------------------------------------------------------------
// --- CORE UI FUNCTIONS ---
// ----------------------------------------------------------------------

/**
 * Creates and appends a new message bubble to the chat.
 */
function addMessage(text, className, timestamp, messageId, status) { 
    const item = document.createElement('div');
    const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    
    // Message Receipt Status Logic (WhatsApp style icons)
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

    // NEW LOGIC: Check if content is a media URL or text
    let contentHTML;
    if (text.startsWith('/uploads/')) {
        const extension = text.split('.').pop().toLowerCase();
        
        // Check for common video extensions
        if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(extension)) {
            // If it's a video URL, use a <video> tag with controls
            contentHTML = `<video src="${text}" class="chat-video" controls alt="Shared video"></video>`;
        } 
        // Check for common image extensions
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension)) {
            // If it's an image URL, use an <img> tag
            contentHTML = `<img src="${text}" class="chat-image" alt="Shared photo">`;
        }
        // Fallback for unrecognized media type
        else {
            contentHTML = `<span class="message-text">Shared file: ${text.substring(text.lastIndexOf('/') + 1)}</span>`;
        }
    } else {
        // Otherwise, use plain text
        contentHTML = `<span class="message-text">${text}</span>`;
    }

    item.innerHTML = `
        ${contentHTML}
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

function formatLastSeen(timestamp) {
    if (!timestamp) return 'Offline';
    const now = new Date();
    const lastSeen = new Date(timestamp);
    const diff = now - lastSeen; // difference in ms

    if (diff < 60000) {
        return 'Recently online';
    } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `Last seen ${minutes} min ago`;
    } else if (diff < 86400000) { 
        const hours = Math.floor(diff / 3600000);
        return `Last seen ${hours} hr ago`;
    } else if (lastSeen.toDateString() === now.toDateString()) {
        return `Last seen today at ${lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return `Last seen ${lastSeen.toLocaleDateString()} at ${lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
}

function requestUserId(userId) {
    socket.emit('set user', userId);
}

// ----------------------------------------------------------------------
// --- USER SELECTION & UI MANAGEMENT ---
// ----------------------------------------------------------------------

function finalizeUserSelection(userId) {
    if (selectionMade || userId === null) return; 

    MY_USER_ID = userId;
    selectionMade = true;
    myUserIdDisplay.textContent = MY_USER_ID;

    initialSelectionArea.style.display = 'none';
    headerBar.style.display = 'flex';
    form.style.display = 'flex';
    messages.innerHTML = ''; 

    requestUserId(MY_USER_ID); 
}

selectUserXBtn.addEventListener('click', function() {
    finalizeUserSelection('x');
});

selectUserIBtn.addEventListener('click', function() {
    finalizeUserSelection('i');
});


// ----------------------------------------------------------------------
// --- STATUS & LOCK LOGIC ---
// ----------------------------------------------------------------------

function updateOtherUserStatus(statusMap) {
    if (MY_USER_ID === null) return; 
    
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


socket.on('online-status-update', function(statusMap) {
    updateOtherUserStatus(statusMap);
});


socket.on('user-lock-status', function(activeUsersMap) {
    
    const sendButton = form.querySelector('#send-button');

    if (!selectionMade) {
        ALL_USERS.forEach(id => {
            const isTaken = activeUsersMap.hasOwnProperty(id);
            const btn = document.getElementById(`select-user-${id}`);
            
            if (btn) {
                if (isTaken) {
                    btn.disabled = true;
                    btn.textContent = `User '${id}' is TAKEN`;
                    btn.classList.add('taken');
                } else {
                    btn.disabled = false;
                    btn.textContent = `Chat as '${id}'`;
                    btn.classList.remove('taken');
                }
            }
        });
        
        initialSelectionArea.style.display = 'flex';
        headerBar.style.display = 'none';
        form.style.display = 'none';
        
    } else if (MY_USER_ID !== null) {
        
        const myLockIsActive = activeUsersMap[MY_USER_ID] === socket.id;
        
        if (!myLockIsActive) {
            console.error(`Error: User ID ${MY_USER_ID} was claimed by another connection.`);
            sendButton.disabled = true;
            input.disabled = true;
        } else {
            sendButton.disabled = false;
            input.disabled = false;
        }
        
        initialSelectionArea.style.display = 'none';
        headerBar.style.display = 'flex';
        form.style.display = 'flex';
    }
});


socket.on('user taken', function(data) {
    alert(`User ID '${data.userId}' is currently being used by another user. Cannot connect.`);
    
    MY_USER_ID = null;
    selectionMade = false;
    myUserIdDisplay.textContent = 'N/A';
    headerBar.style.display = 'none';
    form.style.display = 'none';
    initialSelectionArea.style.display = 'flex';
});


socket.on('connect', () => {
    // CRITICAL: Re-establish user identity after a soft connection break
    if (MY_USER_ID !== null) {
        requestUserId(MY_USER_ID); 
    }
});


// ----------------------------------------------------------------------
// --- PHOTO/VIDEO SENDING LOGIC ---
// ----------------------------------------------------------------------

// 1. Link the photo button to the hidden file input
photoButton.addEventListener('click', () => {
    if (MY_USER_ID === null) {
        alert("Please select your user ID first.");
        return;
    }
    fileInput.click(); 
});

// 2. Listen for file selection and handle upload
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm(`Send file: ${file.name}?`)) {
        fileInput.value = '';
        return;
    }
    
    const formData = new FormData();
    formData.append('image', file); // Use 'image' as the field name as expected by multer setup in index.js
    formData.append('sender', MY_USER_ID);
    
    // Display a temporary local message
    const tempId = Date.now();
    addMessage(`[Sending File: ${file.name}...]`, 'my-message', new Date(), tempId, 'sent');
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            // Server will handle broadcasting the message via Socket.IO after saving
            console.log("File uploaded successfully. Waiting for broadcast.");
            // Remove the temporary message (it will be replaced by the final broadcast message)
            const tempMessageEl = document.querySelector(`.message-bubble[data-id="${tempId}"]`);
            if (tempMessageEl) tempMessageEl.remove();

        } else {
            const errorData = await response.json();
            console.error('File upload failed:', errorData.message);
            alert(`File upload failed: ${errorData.message || 'Check server logs.'}`);
            document.querySelector(`.message-bubble[data-id="${tempId}"] .message-text`).textContent = `[Failed to send file: ${file.name}]`;
        }
        
    } catch (error) {
        console.error('Network error during upload:', error);
        alert('Network error during upload.');
    }
    
    fileInput.value = ''; 
});

// ----------------------------------------------------------------------
// --- DELETE/SELECTION LOGIC ---
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
        if (selectionMade) { headerBar.style.display = 'flex'; }
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
        // Display logic uses the full text/URL, addMessage handles rendering it as image, video, or text
        const display_text = (msg.sender === MY_USER_ID) ? msg.text : `${msg.sender}: ${msg.text}`;
        addMessage(display_text, type, msg.timestamp, msg._id, msg.status); 
    });
});


socket.on('chat message', function(msgData) {
    const type = (msgData.sender === MY_USER_ID) ? 'my-message' : 'their-message';
    // Display logic uses the full text/URL, addMessage handles rendering it as image, video, or text
    const display_text = (msgData.sender === MY_USER_ID) ? msgData.text : `${msgData.sender}: ${msgData.text}`;
    
    addMessage(display_text, type, msgData.timestamp, msgData._id, msgData.status); 
    
    if (type === 'their-message') {
        socket.emit('message delivered', { messageId: msgData._id });
    }
});


socket.on('message status update', function(msgData) {
    const messageElement = document.querySelector(`.message-bubble[data-id="${msgData._id}"]`);

    if (messageElement && msgData.sender === MY_USER_ID) {
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