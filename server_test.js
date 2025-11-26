// server_test.js - Test version without MongoDB for presence system testing

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// --- Socket.IO CORS ---
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
}); 

// --- Global Chat State for User Exclusivity ---
const activeUsers = {
    'i': null, 
    'x': null  
};

// --- User Presence Tracking ---
const userPresence = {
    'i': { 
        isOnline: false, 
        lastSeen: null,
        socketId: null 
    },
    'x': { 
        isOnline: false, 
        lastSeen: null,
        socketId: null 
    }
};

// --- Helper Functions ---
function getTimeAgo(timestamp) {
    if (!timestamp) return null;
    
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffSeconds < 30) return 'just now';
    if (diffSeconds < 60) return 'less than a minute ago';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function broadcastPresenceUpdate() {
    const presenceData = {};
    
    for (const userId in userPresence) {
        presenceData[userId] = {
            isOnline: userPresence[userId].isOnline,
            lastSeen: userPresence[userId].lastSeen,
            timeAgo: userPresence[userId].isOnline ? 'online' : getTimeAgo(userPresence[userId].lastSeen)
        };
    }
    
    io.emit('presence update', presenceData);
    console.log('Presence update broadcasted:', presenceData);
}

// --- Mock message history for testing ---
const mockMessages = [
    {
        _id: '1',
        senderID: 'i',
        message: 'Hello there!',
        type: 'text',
        status: 'read',
        timestamp: new Date(Date.now() - 3600000).toISOString()
    },
    {
        _id: '2',
        senderID: 'x',
        message: 'Hi! How are you?',
        type: 'text',
        status: 'read',
        timestamp: new Date(Date.now() - 3000000).toISOString()
    }
];

// --- Server and Socket.IO Logic ---
app.use(express.static(path.join(__dirname)));

io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    const initialInUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
    socket.emit('available users', initialInUseList);
    
    // Send initial presence data
    const presenceData = {};
    for (const userId in userPresence) {
        presenceData[userId] = {
            isOnline: userPresence[userId].isOnline,
            lastSeen: userPresence[userId].lastSeen,
            timeAgo: userPresence[userId].isOnline ? 'online' : getTimeAgo(userPresence[userId].lastSeen)
        };
    }
    socket.emit('presence update', presenceData); 

    // Send mock history
    socket.emit('history', mockMessages);

    // --- User Selection Event ---
    socket.on('select user', (userId) => {
        if (activeUsers[userId] === null) {
            activeUsers[userId] = socket.id;
            
            // Update presence tracking
            userPresence[userId].isOnline = true;
            userPresence[userId].lastSeen = new Date().toISOString();
            userPresence[userId].socketId = socket.id;
            
            socket.emit('user selected', true);
            console.log(`User ${userId} is now online`);
            
            // Broadcast presence update
            broadcastPresenceUpdate();
        } else {
            socket.emit('user selected', false);
        }
        const inUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
        io.emit('available users', inUseList);
    });
    
    // --- Get Presence Update Event ---
    socket.on('get presence update', () => {
        const presenceData = {};
        for (const userId in userPresence) {
            presenceData[userId] = {
                isOnline: userPresence[userId].isOnline,
                lastSeen: userPresence[userId].lastSeen,
                timeAgo: userPresence[userId].isOnline ? 'online' : getTimeAgo(userPresence[userId].lastSeen)
            };
        }
        socket.emit('presence update', presenceData);
    });
    
    // --- Chat Message Event ---
    socket.on('chat message', async (msg) => {
        // Add ID and status for testing
        msg._id = Date.now().toString();
        msg.status = 'sent';
        console.log(`Message received: ${msg.message} from ${msg.senderID}`);
        
        io.emit('chat message', msg); 
    });

    // --- Read Receipt Event ---
    socket.on('message read', async (data) => {
        console.log(`Message ${data.messageID} marked as read by ${data.readerID}`);
        
        // Notify the sender (all clients) of the status change
        io.emit('message status update', { 
            messageID: data.messageID,
            status: 'read'
        });
    });

    // --- Disconnect Event ---
    socket.on('disconnect', () => {
        const disconnectedUser = Object.keys(activeUsers).find(key => activeUsers[key] === socket.id);
        if (disconnectedUser) {
            activeUsers[disconnectedUser] = null;
            
            // Update presence tracking
            userPresence[disconnectedUser].isOnline = false;
            userPresence[disconnectedUser].lastSeen = new Date().toISOString();
            userPresence[disconnectedUser].socketId = null;
            
            console.log(`User ${disconnectedUser} is now offline`);
            
            const inUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
            io.emit('available users', inUseList);
            
            // Broadcast presence update
            broadcastPresenceUpdate();
        }
    }); 
}); 

server.listen(port, () => {
    console.log(`Test server listening on port ${port}`);
    
    // Start periodic presence updates (every 30 seconds)
    setInterval(broadcastPresenceUpdate, 30000);
});