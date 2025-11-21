// ** CLIENT-SIDE FILE: client.js **

// ----------------------------------------------------------------------
// --- SOCKET.IO CONNECTION (FIXED FOR LIVE DEPLOYMENT) ---
// ----------------------------------------------------------------------

const RENDER_LIVE_URL = 'https://ebab2025.onrender.com'; 
const socketUrl = (window.location.hostname === 'localhost') ? undefined : RENDER_LIVE_URL;

const socket = io(socketUrl, {
    transports: ['websocket']
}); 

// ----------------------------------------------------------------------
// --- USER & DOM ELEMENTS ---
// ----------------------------------------------------------------------

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const userSelector = document.getElementById('user-selector');
const otherUserStatusElement = document.getElementById('other-user-status');
const ALL_USERS = ['x', 'i'];

let MY_USER_ID = userSelector ? userSelector.value : 'x'; 
console.log(`CURRENT CHAT USER ID: ${MY_USER_ID}`);


// ----------------------------------------------------------------------
// --- MESSAGE HELPER FUNCTION (Modified for Delete Button) ---
// ----------------------------------------------------------------------

// Helper function to create and append the message bubble
// 💥 MODIFIED: Accepts messageId
function addMessage(text, className, timestamp, messageId) { 
    const item = document.createElement('div');
    
    const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    
    let deleteButtonHTML = '';
    
    // 💥 NEW: Add delete button if the user is 'x' and the message has an ID
    if (MY_USER_ID === 'x' && messageId) {
        // Use a non-breaking space (&#xa0;) to ensure some spacing if time is short
        deleteButtonHTML = `<button class="delete-btn" data-id="${messageId}">&#10060;</button>`; // ❌ emoji
    }

    item.innerHTML = `
        <span class="message-text">${text}</span>
        <span class="message-time">${time}</span>
        ${deleteButtonHTML}
    `;
    
    item.classList.add('message-bubble', className);
    
    // Set data attribute for quick DOM lookups (especially for deletion)
    if (messageId) item.dataset.id = messageId;
    
    messages.appendChild(item);
    
    // 💥 NEW: Attach event listener for the delete button
    const deleteButton = item.querySelector('.delete-btn');
    if (deleteButton) {
        deleteButton.addEventListener('click', function() {
            if (confirm("Are you sure you want to delete this message?")) {
                const idToDelete = this.getAttribute('data-id');
                // Emit the delete event with the message ID and the sender ID ('x')
                socket.emit('delete message', { messageId: idToDelete, senderId: MY_USER_ID });
            }
        });
    }

    messages.scrollTop = messages.scrollHeight;
    return item;
}


// ----------------------------------------------------------------------
// --- NEW USER ASSIGNMENT & STATUS LOGIC (PREVIOUSLY REQUESTED) ---
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

    const sendButton = form.querySelector('button');
    
    if (!claimedByUser) {
        const availableOption = Array.from(userSelector.options).find(opt => !opt.disabled);
        
        if (availableOption) {
            userSelector.value = availableOption.value;
            MY_USER_ID = availableOption.value;
            requestUserId(MY_USER_ID);
            sendButton.disabled = false; 
            input.disabled = false;
        } else {
            sendButton.disabled = true;
            input.disabled = true;
        }
    } else {
        MY_USER_ID = userSelector.value;
        sendButton.disabled = false;
        input.disabled = false;
    }
    // Update delete button visibility immediately after MY_USER_ID changes
    updateDeleteButtonsVisibility();
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

// 💥 NEW: Function to toggle delete buttons based on current MY_USER_ID
function updateDeleteButtonsVisibility() {
    const allMessages = document.querySelectorAll('.message-bubble');
    allMessages.forEach(msg => {
        let deleteBtn = msg.querySelector('.delete-btn');
        if (MY_USER_ID === 'x' && msg.dataset.id) {
            if (!deleteBtn) {
                 // Re-add button if needed (e.g., history loaded before user selection completed)
                 // This is complex, simply focus on visibility for now.
            }
        } else {
            if (deleteBtn) {
                deleteBtn.remove();
            }
        }
    });
}


// ----------------------------------------------------------------------
// --- REAL-TIME SEND/RECEIVE LOGIC ---
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


// Receive History from Server 💥 MODIFIED
socket.on('history', function(messages) {
    console.log('Received chat history.');
    // Clear old messages before loading history
    messages.innerHTML = ''; 
    messages.forEach(msg => {
        const type = (msg.sender === MY_USER_ID) ? 'my-message' : 'their-message';
        const display_text = (msg.sender === MY_USER_ID) ? msg.text : `${msg.sender}: ${msg.text}`;
        // Pass message._id
        addMessage(display_text, type, msg.timestamp, msg._id); 
    });
});


// Receive Real-Time Message from Server 💥 MODIFIED
socket.on('chat message', function(msgData) {
    const type = (msgData.sender === MY_USER_ID) ? 'my-message' : 'their-message';
    const display_text = (msgData.sender === MY_USER_ID) ? msgData.text : `${msgData.sender}: ${msgData.text}`;
    // Pass message._id
    addMessage(display_text, type, msgData.timestamp, msgData._id); 
});

// 💥 NEW: Handler for message deletion broadcast
socket.on('message deleted', function(data) {
    const messageElement = document.querySelector(`.message-bubble[data-id="${data.messageId}"]`);
    if (messageElement) {
        messageElement.remove();
        console.log(`Message ${data.messageId} removed from DOM.`);
    }
});