// Fixed Load Previous Day button logic
// This fixes the issue where button shows even when database is empty

// client.js - Handles all client-side logic, including file upload and real-time read receipts.

const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ["websocket", "polling"]
}); // Auto-connect with robust reconnection
let currentUser = null;
let pendingHistory = null;
let fullHistory = null; // Store complete history for load more functionality
let latestPresenceData = null;
let presenceTickerId = null;
let localOfflineStart = {};
const OFFLINE_KEY_PREFIX = 'offlineStart_';
const SELECTED_USER_KEY = 'selectedUser';
let lastActivityTs = Date.now();
let windowFocused = true;
let pendingReadIds = new Set();
let readFlushTimer = null;

// Infinite scroll variables
let isLoading = false;
let hasMoreMessages = true;
const MESSAGES_PER_PAGE = 50;

// FIND this code around line 982:
if (fullHistory && fullHistory.length > 0 && fullHistory.length > recentMessages.length) {
    console.log('Calling showLoadMoreButton - fullHistory has', fullHistory.length, 'vs recent', recentMessages.length);
    showLoadMoreButton();
} else {
    console.log('Not showing load more button -', fullHistory ? 'no history loaded' : 'All messages are recent');
}

// Also FIND this code around line 838:

// REPLACE with:
if (messagesHistory && messagesHistory.length > 0 && messagesHistory.length > recentMessages.length) {
    showLoadMoreButton();
}

function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

function forceScrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}
