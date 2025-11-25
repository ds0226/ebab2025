// client.js - Handles client-side logic, including DOM manipulation and Socket.IO communication.

// --- Global Variables and Socket Initialization ---
const socket = io(); 

let currentUser = null;
let requestedUser = null; // Stores the user the client tried to select

// Element references (CRITICAL: Ensure these IDs match index.html exactly)
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const chatContainer = document.getElementById('chat-container');
const userSelectionScreen = document.getElementById('initial-user-selection');
const myUserIdDisplay = document.getElementById('my-user-id-display');
const otherUserStatus = document.getElementById('other-user-status');
const headerBar = document.getElementById('header-bar');

// Button references for user exclusivity feature
const selectUserIButton = document.getElementById('select-user-i'); 
const selectUserXButton = document.getElementById('select-user-x'); 
const sendButton = document.getElementById('send-button');
const photoButton = document.getElementById('photo-button');


// --- User Interface & Setup Logic ---

function setupUserSelection() {
    // CRITICAL FIX: Only attach listeners if the buttons exist.
    if (selectUserIButton && selectUserXButton) {
        selectUserIButton.addEventListener('click', () => requestUserSelection('i', 'x'));
        selectUserXButton.addEventListener('click', () => requestUserSelection('x', 'i'));
    } else {
        console.error("User selection buttons not found in HTML. Check index.html IDs.");
    }
}

// Requests a user ID from the server
function requestUserSelection(selectedUser, otherUser) {
    requestedUser = { selectedUser, otherUser };
    socket.emit('select user', selectedUser);
    
    // Disable buttons temporarily while waiting for server response
    selectUserIButton.disabled = true;
    selectUserXButton.disabled = true;
}

// Updates the UI based on which users are taken (broadcast from server)
function updateAvailableUsers(inUseList) {
    selectUserIButton.disabled = inUseList.includes('i');
    selectUserXButton.disabled = inUseList.includes('x');
    
    // Provide visual feedback
    selectUserIButton.textContent = inUseList.includes('i') ? 'User i (TAKEN)' : 'Chat as: i';
    selectUserXButton.textContent = inUseList.includes('x') ? 'User x (TAKEN)' : 'Chat as: x';
}


// Starts chat and hides the selection screen
function startChat(selectedUser, otherUser) {
    currentUser = selectedUser;
    
    // Hide the selection screen and show the chat container
    userSelectionScreen.style.display = 'none'; 
    chatContainer.style.display = 'flex';       
    headerBar.style.display = 'flex';
    form.style.display = 'flex';
    
    myUserIdDisplay.textContent = currentUser;
    
    // Update the status of the other user
    // Note: True "Online" status requires additional complex logic we haven't implemented, 
    // so we set the status based on the selected user for visual continuity.
    if (otherUser === 'i') {
        otherUserStatus.textContent = 'Recently online';
        otherUserStatus.className = 'status-offline'; 
    } else {
        otherUserStatus.textContent = 'Online';
        otherUserStatus.className = 'status-online';
    }
}

// --- Message Rendering Logic ---

// Handles multiline messages for display
function formatMessageContent(rawMessage) {
    const htmlContent = rawMessage.replace(/\n/g, '<br>'); 
    return htmlContent;
}

function createMessageElement(messageData) {
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
    
    // Add the read status checkmark for sent messages
    if (isMyMessage) {
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status-read'; 
        statusSpan.innerHTML = '✓✓'; // Double checkmark
        timeSpan.appendChild(statusSpan);
    }
    li.appendChild(timeSpan);
    return li;
}

function appendMessage(messageData) {
    const messageElement = createMessageElement(messageData);
    messages.appendChild(messageElement);
    messages.scrollTop = messages.scrollHeight;
}


// --- Socket.IO Receive Handlers ---

// Handles initial state and subsequent updates of user availability
socket.on('available users', (inUseList) => {
    updateAvailableUsers(inUseList);
    
    // Re-enable buttons if a failed request was pending
    if (requestedUser) {
        selectUserIButton.disabled = inUseList.includes('i');
        selectUserXButton.disabled = inUseList.includes('x');
    }
});


// Handles the server's response to the user selection request
socket.on('user selected', (success) => {
    if (requestedUser && success) {
        // SUCCESS: Start the chat
        startChat(requestedUser.selectedUser, requestedUser.otherUser);
        requestedUser = null; 
    } else if (requestedUser && !success) {
        // FAILURE: User was already taken. Alert user.
        alert(`User ${requestedUser.selectedUser} is now taken! Please choose the other user.`);
        requestedUser = null; 
        // 'available users' event handles the button state update
    }
});

// Load historical messages from MongoDB
socket.on('history', (history) => {
    messages.innerHTML = '';
    history.forEach(msg => {
        appendMessage(msg);
    });
});

// Receive a new message in real-time
socket.on('chat message', (msg) => {
    appendMessage(msg);
});


// --- Form Submission Logic (Sending Message) ---

form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Only send if input is not empty and a user is selected
    if (input.value.trim() && currentUser) { 
        const messageText = input.value.trim();
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const messageData = {
            senderID: currentUser, 
            text: messageText,
            time: timeString
        };

        socket.emit('chat message', messageData); 
        
        input.value = ''; // Clear input field
        autoResizeInput(); // Reset textarea height
    }
});

// --- Textarea Auto-Resize ---

function autoResizeInput() {
    // Reset height to calculate scrollHeight correctly
    input.style.height = '44px'; 
    const scrollHeight = input.scrollHeight;
    
    if (scrollHeight > 120) {
        input.style.height = '120px';
    } else {
        input.style.height = scrollHeight + 'px';
    }
}

input.addEventListener('input', () => {
    autoResizeInput();
});

// --- Initialize Application ---
document.addEventListener('DOMContentLoaded', setupUserSelection);