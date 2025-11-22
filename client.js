// client.js - Updated with Socket.IO

// --- Global Variables and Socket Initialization ---
// Initialize socket connection (it automatically connects to the server that served the page)
const socket = io(); 

let currentUser = null;
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
// ... (rest of the global variables)

// --- User Interface & Setup Logic ---
// ... (setupUserSelection, startChat functions remain the same)

// --- Message Rendering Logic ---

// CRITICAL FUNCTION FOR TIGHT LINE SPACING
function formatMessageContent(rawMessage) {
    const htmlContent = rawMessage.replace(/\n/g, '<br>'); 
    return htmlContent;
}

function createMessageElement(messageData) {
    // Determine if the message was sent by the current user viewing the screen
    // We use the 'senderID' property that we will add to the message data
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

// --- Socket.IO Receive Handler ---
// Listen for messages broadcasted from the server
socket.on('chat message', (msg) => {
    // When a message is received from the server, append it to the chat log
    appendMessage(msg);
});


// --- Form Submission Logic (Sending Message) ---

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        const messageText = input.value;
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const messageData = {
            // CRITICAL: We now include the sender ID to correctly determine bubble style on all clients
            senderID: currentUser, 
            text: messageText,
            time: timeString
        };

        // Send the complete message object to the server via socket
        socket.emit('chat message', messageData); 
        
        input.value = ''; // Clear input field
        input.style.height = '44px'; // Reset textarea height
    }
});

// --- Textarea Auto-Resize and Example Data functions remain the same ---
// ... (autoResizeInput, loadExampleMessages, setupUserSelection)

// --- Initialize Application ---
document.addEventListener('DOMContentLoaded', setupUserSelection);