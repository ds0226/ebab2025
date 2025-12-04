// server_with_monitor.js - Fixed server with integrated memory monitoring

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); 
const multer = require('multer'); 
const fs = require('fs');

// Import memory monitor
const MemoryMonitor = require('./memory_monitor');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Initialize memory monitor
const memoryMonitor = new MemoryMonitor(10000); // Check every 10 seconds

// --- Multer Configuration ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync('./uploads')) {
            fs.mkdirSync('./uploads');
        }
        cb(null, './uploads/'); 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/[^a-z0-9.]/gi, '_'));
    }
});

const upload = multer({ storage: storage });

// --- Socket.IO CORS ---
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
}); 

// --- MongoDB Configuration ---
const uri = process.env.MONGO_URI; 

if (!uri) {
    console.error("CRITICAL ERROR: MONGO_URI environment variable is not set.");
    process.exit(1); 
}

const dbName = "chatAppDB"; 
const collectionName = "messages";
let client;
let messagesCollection; 

// --- Global Chat State for User Exclusivity ---
const activeUsers = {
    'i': null, 
    'x': null  
};

// --- User Presence Tracking ---
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

// --- Utility Functions ---
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

// --- FIXED: Memory-Efficient Presence Update Function ---
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
    // FIXED: Removed memory-leaking console.log with full object
    // Only log minimal info for debugging
    const onlineCount = Object.values(presenceData).filter(u => u.isOnline).length;
    console.log(`Presence update sent: ${onlineCount} users online`);
}

// --- Memory Cleanup Functions ---
function cleanupOldConnections() {
    // Clean up any stale socket references
    const now = new Date();
    let cleanedCount = 0;
    
    for (const userId in userPresence) {
        const lastSeen = new Date(userPresence[userId].lastSeen);
        const hoursDiff = (now - lastSeen) / (1000 * 60 * 60);
        
        // If user hasn't been seen for over 1 hour but is marked online, clean up
        if (userPresence[userId].isOnline && hoursDiff > 1) {
            userPresence[userId].isOnline = false;
            userPresence[userId].socketId = null;
            if (activeUsers[userId] === userPresence[userId].socketId) {
                activeUsers[userId] = null;
            }
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} stale connections`);
    }
}

// --- Server and Socket.IO Logic ---
function startServerLogic() {
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

        try {
            const messagesHistory = await messagesCollection.find({}).toArray();
            socket.emit('history', messagesHistory);
        } catch (e) {
            console.error('Error fetching history:', e);
        }

        // --- User Selection Event ---
        socket.on('select user', (userId) => {
            if (activeUsers[userId] === null) {
                activeUsers[userId] = socket.id;
                
                userPresence[userId].isOnline = true;
                userPresence[userId].lastSeen = new Date().toISOString();
                userPresence[userId].socketId = socket.id;
                
                socket.emit('user selected', true);
                console.log(`User ${userId} is now online`);
                
                broadcastPresenceUpdate();

                const otherUserId = userId === 'i' ? 'x' : 'i';
                
                (async () => {
                    try {
                        const pendingMessages = await messagesCollection.find({
                            senderID: otherUserId,
                            status: 'sent'
                        }).toArray();
                        
                        if (pendingMessages.length > 0) {
                            const ids = pendingMessages.map(msg => msg._id);
                            await messagesCollection.updateMany(
                                { _id: { $in: ids } },
                                { $set: { status: 'delivered' } }
                            );
                            const senderSocket = activeUsers[otherUserId];
                            if (senderSocket) {
                                ids.forEach(id => {
                                    io.to(senderSocket).emit('message delivered', { messageID: id });
                                });
                            }
                        }
                    } catch (e) {
                        console.error('Error marking messages as delivered:', e);
                    }
                })();
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

        // --- Get History Event ---
        socket.on('get history', async () => {
            try {
                const messagesHistory = await messagesCollection.find({}).toArray();
                socket.emit('history', messagesHistory);
            } catch (e) {
                console.error('Error fetching history (get history):', e);
            }
        });
        
        // --- Chat Message Event ---
        socket.on('chat message', async (msg) => {
            msg.status = 'sent';
            msg.timestamp = new Date().toISOString();
            
            try {
                await messagesCollection.insertOne(msg);
            } catch (e) {
                console.error('Error saving message:', e);
            }
            
            io.emit('chat message', msg); 

            const sid = msg.senderID || msg.sender;
            if (sid && userPresence[sid]) {
                userPresence[sid].isOnline = true;
                userPresence[sid].lastSeen = new Date().toISOString();
                userPresence[sid].socketId = socket.id;
                broadcastPresenceUpdate();
            }

            const receiverID = sid === 'i' ? 'x' : 'i';
            const receiverOnline = activeUsers[receiverID] !== null;
            if (receiverOnline) {
                try {
                    await messagesCollection.updateOne(
                        { _id: msg._id },
                        { $set: { status: 'delivered' } }
                    );
                    socket.emit('message delivered', { messageID: msg._id });
                } catch (e) {
                    console.error('Error updating delivered status:', e);
                }
            }
        });

        // --- Read Receipt Event ---
        socket.on('message read', async (data) => {
            try {
                await messagesCollection.updateOne(
                    { _id: new ObjectId(data.messageID) },
                    { $set: { status: 'read' } }
                );
            } catch (e) {
                console.error('Error marking message as read:', e);
                return;
            }
            
            io.emit('message status update', { 
                messageID: data.messageID,
                status: 'read'
            });
        });

        // --- Delivery Ack Event ---
        socket.on('message delivered', async (data) => {
            try {
                await messagesCollection.updateOne(
                    { _id: new ObjectId(data.messageID) },
                    { $set: { status: 'delivered' } }
                );
            } catch (e) {
                console.error('Error marking message as delivered:', e);
            }
            
            const senderId = data.senderID;
            const senderSocket = activeUsers[senderId];
            if (senderSocket) {
                io.to(senderSocket).emit('message delivered', { messageID: data.messageID });
            }
        });

        // --- Disconnect Event ---
        socket.on('disconnect', () => {
            const disconnectedUser = Object.keys(activeUsers).find(key => activeUsers[key] === socket.id);
            if (disconnectedUser) {
                activeUsers[disconnectedUser] = null;
                
                userPresence[disconnectedUser].isOnline = false;
                userPresence[disconnectedUser].lastSeen = new Date().toISOString();
                userPresence[disconnectedUser].socketId = null;
                
                console.log(`User ${disconnectedUser} is now offline`);
                
                const inUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
                io.emit('available users', inUseList);
                
                broadcastPresenceUpdate();
            }
        }); 
    }); 

    server.listen(port, () => {
        console.log(`🚀 Server listening on port ${port}`);
        console.log(`🔍 Memory monitoring started (10s intervals)`);
        
        // Start memory monitoring
        memoryMonitor.start();
        
        // Start periodic presence updates (every 30 seconds)
        setInterval(broadcastPresenceUpdate, 30000);
        
        // Start cleanup routine (every 5 minutes)
        setInterval(cleanupOldConnections, 300000);
    }); 
} 

// --- Graceful Shutdown ---
function gracefulShutdown() {
    console.log('\n🔄 Gracefully shutting down...');
    
    // Generate final memory report
    const report = memoryMonitor.getMemoryReport();
    console.log('\n📋 Final Memory Report:');
    console.log(JSON.stringify(report, null, 2));
    
    // Stop monitoring
    memoryMonitor.stop();
    
    // Close server
    server.close(() => {
        console.log('✅ Server closed');
        
        // Close database connection
        if (client) {
            client.close(() => {
                console.log('✅ Database connection closed');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// --- Database Connection ---
async function connectDB() {
    try {
        client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        });

        await client.connect();
        console.log('✅ Successfully connected to MongoDB!');
        
        const db = client.db(dbName);
        messagesCollection = db.collection(collectionName);
        
        startServerLogic();

    } catch (e) {
        console.error('❌ Failed to connect to MongoDB:', e);
        process.exit(1); 
    }
}

// Start the application
connectDB();