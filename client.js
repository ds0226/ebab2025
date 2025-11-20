// ** CLIENT-SIDE FILE: client.js **

// ----------------------------------------------------------------------
// --- SOCKET.IO CONNECTION (FIXED FOR LIVE DEPLOYMENT) ---
// ----------------------------------------------------------------------

// 1. CRITICAL: Set your actual live Render URL.
const RENDER_LIVE_URL = 'https://ebab2025.onrender.com'; 

// Check if we are running locally or live (window is available here)
// Connects to RENDER_LIVE_URL if deployed, or to the local host if running locally.
const socketUrl = (window.location.hostname === 'localhost') ? undefined : RENDER_LIVE_URL;

// Establish the Socket.IO connection, forcing 'websocket' for stability on cloud hosts
const socket = io(socketUrl, {
    transports: ['websocket'] // Forces the most stable transport protocol
}); 

// ----------------------------------------------------------------------
// --- USER & DOM ELEMENTS ---
// ----------------------------------------------------------------------

// Get DOM elements
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const userSelector = document.getElementById('user-selector'); // Assuming you added the dropdown

// Initialize MY_USER_ID from the selector
let MY_USER_ID = userSelector ? userSelector.value : 'x'; // Default to 'x' if dropdown isn't found
console.log(`CURRENT CHAT USER ID: ${MY_USER_ID}`);

// Event listener to change the ID when the dropdown changes
if (userSelector) {
    userSelector.addEventListener('change', function() {
        MY_USER_ID = this.value;
        console.log(`CURRENT CHAT USER ID changed to: ${MY_USER_ID}`);
    });
}


// ----------------------------------------------------------------------
// --- MESSAGE HELPER FUNCTION (Modified to include timestamp) ---
// ----------------------------------------------------------------------

// Helper function to create and append the message bubble
function addMessage(text, className, timestamp) {
    const item = document.createElement('div');
    
    // Format the timestamp if it's provided
    const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    item.innerHTML = `
        <span class="message-text">${text}</span>
        <span class="message-time">${time}</span>
    `;
    
    item.classList.add('message-bubble', className);
    messages.appendChild(item);
    
    // Auto-scroll to the bottom
    messages.scrollTop = messages.scrollHeight;
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
        
        // Add the message to the current user's chat window immediately (using current time)
        addMessage(msgData.text, 'my-message', new Date()); 
        
        input.value = ''; // Clear the input field
    }
});


// 2. Receive History from Server
socket.on('history', function(messages) {
    console.log('Received chat history.');
    messages.forEach(msg => {
        const type = (msg.sender === MY_USER_ID) ? 'my-message' : 'their-message';
        const display_text = (msg.sender === MY_USER_ID) ? msg.text : `${msg.sender}: ${msg.text}`;
        addMessage(display_text, type, msg.timestamp); // Pass timestamp for history
    });
});


// 3. Receive Real-Time Message from Server
socket.on('chat message', function(msgData) {
    // Only display the message if it's from the *other* person
    if (msgData.sender !== MY_USER_ID) {
        addMessage(`${msgData.sender}: ${msgData.text}`, 'their-message', msgData.timestamp); // Pass timestamp
    }
});