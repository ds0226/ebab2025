// Establish the Socket.IO connection
const socket = io(); 

// Get DOM elements
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

// *** SET YOUR USER ID HERE ***
// To test, open one browser tab (User A) and another (User B).
let MY_USER_ID = 'User A'; // Change this in the second tab to 'User B'
console.log(`CURRENT CHAT USER ID: ${MY_USER_ID}`);


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
        
        // Add the message to the current user's chat window immediately
        addMessage(msgData.text, 'my-message'); 
        
        input.value = ''; // Clear the input field
    }
});


// 2. Receive Message from Server
socket.on('chat message', function(msgData) {
    // Only display the message if it's from the *other* person
    if (msgData.sender !== MY_USER_ID) {
        addMessage(`${msgData.sender}: ${msgData.text}`, 'their-message');
    }
});

// --- Find and replace the io initialization line ---

const { Server } = require("socket.io");

// 1. Get the external URL from Render's environment variable
//    This allows the client (browser) to connect securely.
const externalUrl = process.env.RENDER_EXTERNAL_URL; 

const io = new Server(server, {
    cors: {
        // Set the origin to allow connections from your deployed URL
        origin: externalUrl || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

const RENDER_LIVE_URL = 'https://ebab2025.onrender.com/'; // <--- PASTE YOUR REAL URL HERE


// Helper function to create and append the message bubble
function addMessage(text, className) {
    const item = document.createElement('div');
    item.textContent = text;
    item.classList.add('message-bubble', className);
    messages.appendChild(item);
    
    // Auto-scroll to the bottom
    messages.scrollTop = messages.scrollHeight;
}