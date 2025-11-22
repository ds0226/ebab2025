// client.js - Handles client-side logic, including DOM manipulation and Socket.IO communication.

// --- Global Variables and Socket Initialization ---
const socket = io(); 

let currentUser = null;
let requestedUser = null; // Stores the user the client tried to select
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const chatContainer = document.getElementById('chat-container');
const userSelectionScreen = document.getElementById('initial-user-selection');
const myUserIdDisplay = document.getElementById('my-user-id-display');
const otherUserStatus = document.getElementById('other-user-status');
const headerBar = document.getElementById('header-bar');
// CRITICAL: Ensure these IDs match your HTML
const selectUserIButton = document.getElementById('select-user-i'); 
const selectUserXButton = document.getElementById('select-user-x'); 
const sendButton = document.getElementById('send-button');
const photoButton = document.getElementById('photo-button');


// --- User Interface & Setup Logic ---

function setupUserSelection() {
    // Attach event listeners to the user selection buttons
    selectUserIButton.addEventListener('click', () => requestUserSelection('i', 'x'));
    selectUserXButton.addEventListener('click', () => requestUserSelection('x', 'i'));
}

// Requests a user ID from the server
function requestUserSelection(selectedUser, otherUser) {
    // Store the request state before sending
    requestedUser = { selectedUser, otherUser };
    socket.emit('select user', selectedUser);
    
    // Disable buttons temporarily while waiting for server response
    selectUserIButton.disabled = true;
    selectUserXButton.disabled = true;
}

// Updates the UI based on which users are taken
function updateAvailableUsers(inUseList) {
    selectUserIButton.disabled = inUseList.includes('i');
    selectUserXButton.disabled = inUseList.includes('x');
    
    // Provide visual feedback
    selectUserIButton.textContent = inUseList.includes('i') ? 'User i (TAKEN)' : 'Chat as: i';
    selectUserXButton.textContent = inUseList.includes('x') ? 'User x (TAKEN)' : 'Chat as: x';
}


// CRITICAL: This is the function that should hide the selection screen and show the chat.
function startChat(selectedUser, otherUser) {
    currentUser = selectedUser;
    
    // Check if these elements exist and are correctly identified.
    userSelectionScreen.style.display = 'none'; // HIDES THE SELECTION SCREEN
    chatContainer.style.display = 'flex';       // SHOWS THE CHAT AREA
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
// ... (formatMessageContent, createMessageElement, appendMessage functions remain the same) ...
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
    messages.scrollTop = messages.scrollHeight;
}


// --- Socket.IO Receive Handlers ---

// Handles initial state and updates button availability
socket.on('available users', (inUseList) => {
    updateAvailableUsers(inUseList);
    
    // If the client was waiting for a selection, re-enable the buttons if selection failed
    if (requestedUser) {
        selectUserIButton.disabled = inUseList.includes('i');
        selectUserXButton.disabled = inUseList.includes('x');
    }
});


// Handles the server's response to a user selection request
socket.on('user selected', (success) => {
    if (requestedUser && success) {
        // SUCCESS: Start the chat and clear the request state
        startChat(requestedUser.selectedUser, requestedUser.otherUser);
        requestedUser = null; 
    } else if (requestedUser && !success) {
        // FAILURE: User was already taken. Re-enable the remaining button(s).
        alert(`User ${requestedUser.selectedUser} is now taken! Please choose the other user.`);
        
        // This relies on the 'available users' event to update the final button state
        requestedUser = null; 
    }
});

// History and Chat Message handlers
socket.on('history', (history) => {
    messages.innerHTML = '';
    history.forEach(msg => {
        appendMessage(msg);
    });
});

socket.on('chat message', (msg) => {
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

        socket.emit('chat message', messageData); 
        
        input.value = ''; // Clear input field
        autoResizeInput(); // Reset textarea height
    }
});

// --- Textarea Auto-Resize ---

function autoResizeInput() {
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