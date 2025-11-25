// client.js - Handles all client-side logic, including user selection and message rendering.

// CRITICAL FIX: Use the full deployed URL for Socket.IO connection
// Replace 'https://ebab2025.onrender.com' with your actual deployed URL if it changes.
const socket = io('https://ebab2025.onrender.com'); 
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
const chatContainer = document.getElementById('chat-container');

// --- Utility Functions ---

function getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Scrolls the messages container to the bottom
function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

// --- Message Rendering Logic ---

function createMessageElement(messageData) {
    // FIX: Check for senderID (used by modern client) OR sender (used by some old history)
    const senderKey = messageData.senderID || messageData.sender;
    const isMyMessage = senderKey === currentUser;

    const li = document.createElement('li');
    li.className = `message-bubble ${isMyMessage ? 'my-message' : 'their-message'}`;
    li.dataset.id = messageData._id;

    // Message Text
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    textSpan.textContent = messageData.message;

    // Time and Status Container
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = getCurrentTime(); 

    // Status Checkmarks (Only for 'my-message')
    if (isMyMessage) {
        const statusSpan = document.createElement('span');
        statusSpan.classList.add('status-sent', 'status-read'); 
        statusSpan.innerHTML = '✓✓'; // Double checkmark icon
        timeSpan.appendChild(statusSpan);
    }

    li.appendChild(textSpan);
    li.appendChild(timeSpan);

    // Add click handler for selection/deletion (Placeholder logic)
    li.addEventListener('click', () => {
        // ... (Deletion logic placeholder if implemented later) ...
    });
    
    return li;
}

// Renders a single message to the chat
function renderMessage(messageData) {
    messages.appendChild(createMessageElement(messageData));
    scrollToBottom();
}

// --- Socket.IO Event Listeners ---

// 1. Handle incoming chat messages (real-time and self-sent echoes)
socket.on('chat message', (msg) => {
    // Only render if the message is from the other user OR if it's the current user sending it
    const senderKey = msg.senderID || msg.sender;
    if (senderKey === currentUser || senderKey !== currentUser) {
        renderMessage(msg);
    }
});

// 2. Handle history load
socket.on('history', (messagesHistory) => {
    messagesHistory.forEach(renderMessage);
});

// 3. Handle availability updates from server
socket.on('available users', (inUseList) => {
    const iButton = document.querySelector('#initial-user-selection button[data-user="i"]');
    const xButton = document.querySelector('#initial-user-selection button[data-user="x"]');

    if (iButton) iButton.disabled = inUseList.includes('i');
    if (xButton) xButton.disabled = inUseList.includes('x');

    // Update the other user's status display if already logged in
    if (currentUser) {
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        const isOtherUserOnline = inUseList.includes(otherUser);
        
        otherUserStatus.textContent = isOtherUserOnline ? 'Online' : 'Recently online';
        otherUserStatus.className = isOtherUserOnline ? 'status-online' : 'status-offline';
    }
}); 

// 4. Handle server response after attempting to select a user 
socket.on('user selected', (success) => {
    if (success) {
        // Successful login: Hide selection, show chat UI
        selectionScreen.style.display = 'none';
        headerBar.style.display = 'flex';
        form.style.display = 'flex';
        chatContainer.style.display = 'flex';
        currentUserDisplay.textContent = currentUser;
        input.focus();
    } else {
        // Failed login (user taken or invalid ID sent)
        
        // This check prevents an infinite loop if the server sends back 'false' for an invalid ID
        if (currentUser) {
            alert('User is already selected by another client.');
        } else {
             // Optional: Alert for invalid ID, though the server usually handles this
             console.error("Server rejected selection with an invalid user ID.");
        }
        
        currentUser = null;
        // Re-enable all buttons
        document.querySelectorAll('#initial-user-selection button').forEach(btn => btn.disabled = false);
    }
});


// --- Initial Setup and Event Handlers ---

// Handle the chat message form submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value && currentUser) {
        const messageData = {
            senderID: currentUser, // Use the ID the client selected
            message: input.value,
            timestamp: new Date().toISOString()
        };
        
        socket.emit('chat message', messageData);
        input.value = '';
    }
});

// Handle the initial user selection (CRITICAL SECTION)
document.querySelectorAll('#initial-user-selection button').forEach(button => {
    button.addEventListener('click', () => {
        const userId = button.dataset.user; // <-- Reads 'i' or 'x' from the button
        
        // 1. Optimistically set the current user
        currentUser = userId;

        // 2. Disable all buttons temporarily (until server confirms)
        document.querySelectorAll('#initial-user-selection button').forEach(btn => btn.disabled = true);

        // 3. Send selection request to server
        // This is the critical line that sends the correct ID ('i' or 'x')
        socket.emit('select user', userId);
    });
});