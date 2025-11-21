// ** CLIENT-SIDE FILE: client.js **

// ----------------------------------------------------------------------
// --- SOCKET.IO CONNECTION (FIXED FOR LIVE DEPLOYMENT) ---
// ----------------------------------------------------------------------

// 1. CRITICAL: Set your actual live Render URL.
const RENDER_LIVE_URL = 'https://ebab2025.onrender.com'; 

// Check if we are running locally or live (window is available here)
const socketUrl = (window.location.hostname === 'localhost') ? undefined : RENDER_LIVE_URL;

// Establish the Socket.IO connection
const socket = io(socketUrl, {
    transports: ['websocket']
}); 

// ----------------------------------------------------------------------
// --- USER & DOM ELEMENTS ---
// ----------------------------------------------------------------------

// Get DOM elements
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const userSelector = document.getElementById('user-selector'); 

let MY_USER_ID = userSelector ? userSelector.value : 'x'; 
console.log(`CURRENT CHAT USER ID: ${MY_USER_ID}`);

if (userSelector) {
    userSelector.addEventListener('change', function() {
        MY_USER_ID = this.value;
        console.log(`CURRENT CHAT USER ID changed to: ${MY_USER_ID}`);
    });
}


// ----------------------------------------------------------------------
// --- MESSAGE HELPER FUNCTION (Modified to include status) ---
// ----------------------------------------------------------------------

// Helper function to create and append the message bubble
// 💥 MODIFIED: Accepts 'status'
function addMessage(text, className, timestamp, status, messageId) { 
    const item = document.createElement('div');
    
    // Format the timestamp if it's provided
    const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    
    // 💥 NEW: Status logic
    let statusIcon = '';
    if (className === 'my-message' && status) {
        if (status === 'read') {
            statusIcon = '<span class="status-read">✓✓</span>'; // Double checkmark (styled blue in CSS)
        } else if (status === 'delivered') {
            statusIcon = '<span class="status-delivered">✓✓</span>'; // Double checkmark (styled gray in CSS)
        } else {
            statusIcon = '<span class="status-sent">✓</span>'; // Single checkmark (plain text or basic color)
        }
    }

    item.innerHTML = `
        <span class="message-text">${text}</span>
        <span class="message-time">${time} ${statusIcon}</span>
    `;
    
    item.classList.add('message-bubble', className);
    
    // 💥 NEW: Add message ID to element for easy status updates
    if (messageId) item.dataset.id = messageId;
    
    messages.appendChild(item);
    
    // Auto-scroll to the bottom
    messages.scrollTop = messages.scrollHeight;
    
    return item;
}


// ----------------------------------------------------------------------
// --- REAL-TIME SEND/RECEIVE LOGIC ---
// ----------------------------------------------------------------------

// 1. Send Message on Form Submit
form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (input.value) {
        const msgData = {
            sender: MY_USER_ID,
            text: input.value
        };
        
        // Emit the message to the server
        socket.emit('chat message', msgData);
        
        // 💥 MODIFIED: Do NOT add message immediately. Wait for the server to broadcast
        // the saved message (with MongoDB _id and timestamp) to avoid duplicates and simplify status tracking.
        
        input.value = ''; // Clear the input field
    }
});


// 2. Receive History from Server
socket.on('history', function(messages) {
    console.log('Received chat history.');
    messages.forEach(msg => {
        const type = (msg.sender === MY_USER_ID) ? 'my-message' : 'their-message';
        const display_text = (msg.sender === MY_USER_ID) ? msg.text : `${msg.sender}: ${msg.text}`;
        // 💥 MODIFIED: Pass status and _id
        addMessage(display_text, type, msg.timestamp, msg.status, msg._id); 
    });
});


// 3. Receive Real-Time Message from Server
socket.on('chat message', function(msgData) {
    const type = (msgData.sender === MY_USER_ID) ? 'my-message' : 'their-message';
    const display_text = (msgData.sender === MY_USER_ID) ? msgData.text : `${msgData.sender}: ${msgData.text}`;
    
    // 💥 MODIFIED: Display message for ALL users now
    addMessage(display_text, type, msgData.timestamp, msgData.status, msgData._id);

    // If it's a message from the OTHER person, confirm delivery.
    if (type === 'their-message') {
        // Send a confirmation back to the server, using the message's ID from MongoDB
        socket.emit('message delivered', { messageId: msgData._id });
        
        // Optional: Emit 'message read' when the user brings the window into focus
        // Example: window.addEventListener('focus', () => socket.emit('message read', { messageId: msgData._id }));
    }
});


// 4. 💥 NEW: Handle status updates broadcast from server
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