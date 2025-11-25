const socket = io();
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
    timeSpan.textContent = getCurrentTime(); // Use current time for newly rendered history

    // Status Checkmarks (Only for 'my-message')
    if (isMyMessage) {
        // Placeholder for single tick (Sent)
        const statusSpan = document.createElement('span');
        statusSpan.classList.add('status-sent', 'status-read'); // Using 'status-read' class for final look
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
        
        otherUserStatus.textContent = isOtherUserOnline ? 'Online