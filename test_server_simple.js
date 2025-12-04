// test_server_simple.js - Simple server without MongoDB for testing memory fixes

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const MemoryMonitor = require('./memory_monitor');

const app = express();
const server = http.createServer(app);
const port = 3000;

// Initialize memory monitor
const memoryMonitor = new MemoryMonitor(5000); // Check every 5 seconds

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Global state (simulating the original problem)
const activeUsers = {
    'i': null,
    'x': null
};

const userPresence = {
    'i': {
        isOnline: false,
        lastSeen: new Date().toISOString(),
        socketId: null
    },
    'x': {
        isOnline: false,
        lastSeen: new Date().toISOString(),
        socketId: null
    }
};

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    
    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    return 'over an hour ago';
}

// FIXED VERSION - No memory leak
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
    
    // FIXED: Only log minimal info instead of full object
    const onlineCount = Object.values(presenceData).filter(u => u.isOnline).length;
    console.log(`✅ Presence update sent: ${onlineCount} users online`);
}

// BROKEN VERSION - With memory leak (for comparison)
function broadcastPresenceUpdate_LEAKY() {
    const presenceData = {};
    
    for (const userId in userPresence) {
        presenceData[userId] = {
            isOnline: userPresence[userId].isOnline,
            lastSeen: userPresence[userId].lastSeen,
            timeAgo: userPresence[userId].isOnline ? 'online' : getTimeAgo(userPresence[userId].lastSeen)
        };
    }
    
    io.emit('presence update', presenceData);
    
    // 🚨 MEMORY LEAK: Logging full object every 30 seconds
    console.log('Presence update broadcasted:', presenceData);
}

io.on('connection', (socket) => {
    console.log('📱 Client connected:', socket.id);

    // Send initial data
    const initialInUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
    socket.emit('available users', initialInUseList);

    const presenceData = {};
    for (const userId in userPresence) {
        presenceData[userId] = {
            isOnline: userPresence[userId].isOnline,
            lastSeen: userPresence[userId].lastSeen,
            timeAgo: userPresence[userId].isOnline ? 'online' : getTimeAgo(userPresence[userId].lastSeen)
        };
    }
    socket.emit('presence update', presenceData);

    socket.on('select user', (userId) => {
        if (activeUsers[userId] === null) {
            activeUsers[userId] = socket.id;
            userPresence[userId].isOnline = true;
            userPresence[userId].lastSeen = new Date().toISOString();
            userPresence[userId].socketId = socket.id;
            
            socket.emit('user selected', true);
            console.log(`👤 User ${userId} is now online`);
            
            broadcastPresenceUpdate();
        }
    });

    socket.on('chat message', (msg) => {
        msg.timestamp = new Date().toISOString();
        io.emit('chat message', msg);

        const sid = msg.senderID || msg.sender;
        if (sid && userPresence[sid]) {
            userPresence[sid].isOnline = true;
            userPresence[sid].lastSeen = new Date().toISOString();
            userPresence[sid].socketId = socket.id;
            broadcastPresenceUpdate();
        }
    });

    socket.on('disconnect', () => {
        const disconnectedUser = Object.keys(activeUsers).find(key => activeUsers[key] === socket.id);
        if (disconnectedUser) {
            activeUsers[disconnectedUser] = null;
            userPresence[disconnectedUser].isOnline = false;
            userPresence[disconnectedUser].lastSeen = new Date().toISOString();
            userPresence[disconnectedUser].socketId = null;
            
            console.log(`👤 User ${disconnectedUser} is now offline`);
            broadcastPresenceUpdate();
        }
    });
});

server.listen(port, () => {
    console.log(`🚀 Test server running on port ${port}`);
    console.log(`🔍 Memory monitoring: 5s intervals`);
    console.log(`📡 Presence updates: 30s intervals`);
    console.log(`\n📊 This server demonstrates the FIXED version (no memory leak)`);
    console.log(`💡 Compare memory usage with the leaky version if needed`);
    
    // Start monitoring
    memoryMonitor.start();
    
    // Start presence updates
    setInterval(broadcastPresenceUpdate, 30000);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down...');
    memoryMonitor.stop();
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});