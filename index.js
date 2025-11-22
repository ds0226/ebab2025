// --- Global Variables ---
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
    document.getElementById('select-user-i').addEventListener('click', () => startChat('i', 'x'));
    document.getElementById('select-user-x').addEventListener('click', () => startChat('x', 'i'));
}

function startChat(selectedUser, otherUser) {
    currentUser = selectedUser;
    userSelectionScreen.style.display = 'none';
    chatContainer.style.display = 'flex';
    headerBar.style.display = 'flex';
    form.style.display = 'flex';
    
    myUserIdDisplay.textContent = currentUser;
    
    // Simple way to show who the other user is.
    if (otherUser === 'i') {
        otherUserStatus.textContent = 'Recently online';
        otherUserStatus.className = 'status-offline'; // Using the 'offline' style for 'Recently online'
    } else {
        otherUserStatus.textContent = 'Online';
        otherUserStatus.className = 'status-online';
    }

    // Load initial example messages for testing the layout
    loadExampleMessages();
}

// --- Message Rendering Logic ---

// CRITICAL FUNCTION FOR TIGHT LINE SPACING
function formatMessageContent(rawMessage) {
    // 1. Convert ALL newline characters (\n) to <br> tags. 
    // This allows the browser to use standard line breaks instead of pre-wrap blocks, 
    // which fixes the line spacing issue.
    const htmlContent = rawMessage.replace(/\n/g, '<br>'); 
    return htmlContent;
}

function createMessageElement(messageData) {
    const li = document.createElement('li');
    li.className = `message-bubble ${messageData.sender === currentUser ? 'my-message' : 'their-message'}`;
    
    // 1. Create the text content element
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    
    // 2. Use the formatter and innerHTML to render the text and <br> tags
    textSpan.innerHTML = formatMessageContent(messageData.text); 
    li.appendChild(textSpan);

    // 3. Create the time and status container
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    
    timeSpan.textContent = messageData.time;

    // 4. Add the status icon for "my-messages"
    if (messageData.sender === currentUser) {
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status-read'; // Assuming read status for demonstration
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

// --- Form Submission Logic ---

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        const messageText = input.value;
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const newMessage = {
            sender: currentUser,
            text: messageText,
            time: timeString
        };

        appendMessage(newMessage);
        input.value = ''; // Clear input field
        input.style.height = '44px'; // Reset textarea height
    }
});

// --- Textarea Auto-Resize and Send Button Toggle ---

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

// Event listener for input changes to resize and check content
input.addEventListener('input', () => {
    autoResizeInput();
});

// --- Example Data for Layout Testing ---

function loadExampleMessages() {
    const exampleMessages = [
        { sender: 'i', text: 'This is a test message.', time: '10:00 AM' },
        { sender: 'x', text: 'Hey there! How is the layout looking?', time: '10:01 AM' },
        // Multi-line test message using \n
        { 
            sender: 'i', 
            text: "This is line one.\nThis is line two.\nThis is line three.", 
            time: '10:02 AM' 
        },
        // Another multi-line test message
        { 
            sender: 'x', 
            text: "Does this message wrap correctly?\nAnd is the vertical space tight now?\nWe are aiming for a compact look!", 
            time: '10:03 AM' 
        },
        // Single line to ensure the bubble height looks right
        { sender: 'i', text: 'Looking much better!', time: '10:05 AM' }
    ];

    exampleMessages.forEach(msg => {
        appendMessage(msg);
    });
}

// --- Initialize Application ---
document.addEventListener('DOMContentLoaded', setupUserSelection);