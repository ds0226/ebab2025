// client.js - Handles client-side logic, including DOM manipulation and Socket.IO communication.

// --- Global Variables and Socket Initialization ---
// Initialize socket connection (it automatically connects to the server that served the page)
const socket = io(); 

let currentUser = null;
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const chatContainer = document.getElementById('chat-container');
const userSelectionScreen = document.getElementById('initial-user-selection');
const myUserIdDisplay = document.getElementById('my-user-id-display');
const otherUserStatus = document.getElementById('other-user-status');
const headerBar = document.getElementById('header-bar');
const sendButton = document.getElementById('send-button');
const photoButton = document.getElementById('photo-button');


// --- User Interface & Setup Logic ---

function setupUserSelection() {
    // Attach event listeners to the user selection buttons
    document.getElementById('select-user-i').addEventListener('click', () => startChat('i', 'x'));
    document.getElementById('select-user-x').addEventListener('click', () => startChat('x', 'i'));
}

function startChat(selectedUser, otherUser) {
    currentUser = selectedUser;
    
    // Hide the selection screen and show the chat interface
    userSelectionScreen.style.display = 'none';
    chatContainer.style.display = 'flex';
    headerBar.style.display = 'flex';
    form.style.display = 'flex';
    
    myUserIdDisplay.textContent = currentUser;
    
    // Update the status of the other user
    if (otherUser === 'i') {
        otherUserStatus.textContent = 'Recently online';
        otherUserStatus.className = 'status-offline'; 
    } else {
        otherUserStatus.textContent = 'Online';
        otherUserStatus.className = 'status-online';
    }
}

// --- Message Rendering Logic ---

// CRITICAL FUNCTION FOR TIGHT LINE SPACING: converts newlines to <br> tags
function formatMessageContent(rawMessage) {
    // Replaces all line breaks in the raw text with HTML <br> tags
    const htmlContent = rawMessage.replace(/\n/g, '<br>'); 
    return htmlContent;
}

function createMessageElement(messageData) {
    // Determine if the message was sent by the current user viewing the screen
    const isMyMessage = messageData.senderID === currentUser; 

    const li = document.createElement('li');
    li.className = `message-bubble ${isMyMessage ? 'my-message' : 'their-message'}`;
    
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    textSpan.innerHTML = formatMessageContent(messageData.text); 
    li.appendChild(textSpan);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = messageData.time;

    // Add the status icon only if the message was sent by the current user
    if (isMyMessage) {
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status-read'; 
        statusSpan.innerHTML = '✓✓';
        timeSpan.appendChild(statusSpan);
    }
    
    li.appendChild(timeSpan);
    
    return li;
}

function appendMessage(messageData) {
    const messageElement = createMessageElement(messageData);
    messages.appendChild(messageElement);
    // Auto-scroll to the bottom of the chat
    messages.scrollTop = messages.scrollHeight;
}

// --- Socket.IO Receive Handlers ---

// Listen for the initial message history sent by the server
socket.on('history', (history) => {
    // Clear the chat interface before loading history
    messages.innerHTML = '';
    
    // Append every message from the history array
    history.forEach(msg => {
        appendMessage(msg);
    });
});

// Listen for new, real-time messages
socket.on('chat message', (msg) => {
    // This handles all new messages sent AFTER connection
    appendMessage(msg);
});


// --- Form Submission Logic (Sending Message) ---

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) {
        const messageText = input.value.trim();
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const messageData = {
            senderID: currentUser, 
            text: messageText,
            time: timeString
        };

        // Send the complete message object to the server via socket
        socket.emit('chat message', messageData); 
        
        input.value = ''; // Clear input field
        autoResizeInput(); // Reset textarea height
    }
});

// --- Textarea Auto-Resize ---

function autoResizeInput() {
    // Reset height to determine scroll height accurately
    input.style.height = '44px'; 
    const scrollHeight = input.scrollHeight;
    
    // Only expand up to 120px (max-height set in CSS)
    if (scrollHeight > 120) {
        input.style.height = '120px';
    } else {
        input.style.height = scrollHeight + 'px';
    }
}

// Event listener for input changes to resize
input.addEventListener('input', () => {
    autoResizeInput();
});

// --- Initialize Application ---
document.addEventListener('DOMContentLoaded', setupUserSelection);