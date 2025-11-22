// client.js - Handles client-side logic, including DOM manipulation and Socket.IO communication.

// --- Global Variables and Socket Initialization ---
const socket = io(); 

let currentUser = null;
let requestedUser = null; // NEW: Store the user the client tried to select
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const chatContainer = document.getElementById('chat-container');
const userSelectionScreen = document.getElementById('initial-user-selection');
const myUserIdDisplay = document.getElementById('my-user-id-display');
const otherUserStatus = document.getElementById('other-user-status');
const headerBar = document.getElementById('header-bar');
const selectUserIButton = document.getElementById('select-user-i'); // NEW
const selectUserXButton = document.getElementById('select-user-x'); // NEW

// ... (Existing createMessageElement, appendMessage, formatMessageContent functions) ...

// --- User Interface & Setup Logic ---

function setupUserSelection() {
    // Attach event listeners to the user selection buttons
    // FIX: Changed click handlers to call requestUserSelection
    selectUserIButton.addEventListener('click', () => requestUserSelection('i', 'x'));
    selectUserXButton.addEventListener('click', () => requestUserSelection('x', 'i'));
}

// NEW FUNCTION: Requests a user ID from the server
function requestUserSelection(selectedUser, otherUser) {
    requestedUser = { selectedUser, otherUser };
    socket.emit('select user', selectedUser);
    
    // Disable buttons temporarily while waiting for server response
    selectUserIButton.disabled = true;
    selectUserXButton.disabled = true;
}

// NEW FUNCTION: Updates the UI based on which users are taken
function updateAvailableUsers(inUseList) {
    selectUserIButton.disabled = inUseList.includes('i');
    selectUserXButton.disabled = inUseList.includes('x');
    
    // Provide visual feedback
    selectUserIButton.textContent = inUseList.includes('i') ? 'User i (TAKEN)' : 'Chat as: i';
    selectUserXButton.textContent = inUseList.includes('x') ? 'User x (TAKEN)' : 'Chat as: x';
}


// MODIFIED FUNCTION: Starts chat only after server confirmation
function startChat(selectedUser, otherUser) {
    currentUser = selectedUser;
    
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

// --- Socket.IO Receive Handlers ---

// NEW: Handles initial state and updates button availability
socket.on('available users', (inUseList) => {
    updateAvailableUsers(inUseList);
    
    // If the client was waiting for a selection, re-enable the buttons if selection failed
    if (requestedUser) {
        selectUserIButton.disabled = inUseList.includes('i');
        selectUserXButton.disabled = inUseList.includes('x');
    }
});


// NEW: Handles the server's response to a user selection request
socket.on('user selected', (success) => {
    if (requestedUser && success) {
        startChat(requestedUser.selectedUser, requestedUser.otherUser);
        requestedUser = null; // Clear request state
    } else if (requestedUser && !success) {
        alert(`User ${requestedUser.selectedUser} is now taken! Please choose the other user.`);
        
        // Re-enable/update buttons based on the latest state received
        socket.emit('get available users'); // Request the latest list again
        requestedUser = null; 
    }
});

// ... (The rest of socket.on('history') and socket.on('chat message') remains the same) ...

// ... (The rest of form.addEventListener('submit'), autoResizeInput, etc. remains the same) ...