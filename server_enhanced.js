// server_enhanced.js - Enhanced server with accurate timestamps and WhatsApp-style status

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); 
const multer = require('multer'); 
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

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

// --- Enhanced Helper Functions ---
function getTimeAgo(timestamp) {
    if (!timestamp) return null;
    
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffSeconds < 60) return 'just now';
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
    const onlineCount = Object.values(presenceData).filter(u => u.isOnline).length;
    console.log(`Presence update sent: ${onlineCount} users online`);
}

// --- Enhanced Message Status Functions ---
function updateMessageStatus(messageId, newStatus, timestampField = null) {
    const updateData = { status: newStatus };
    
    // Add timestamp for the status change
    if (timestampField) {
        updateData[timestampField] = new Date().toISOString();
    }
    
    return messagesCollection.updateOne(
        { _id: new ObjectId(messageId) },
        { $set: updateData }
    );
}

function notifyStatusChange(messageId, status, targetSocket = null) {
    const eventData = { messageID: messageId, status };
    
    // Add timestamp for client-side accuracy
    eventData.timestamp = new Date().toISOString();
    
    if (targetSocket) {
        io.to(targetSocket).emit('message status update', eventData);
    } else {
        io.emit('message status update', eventData);
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

                // Enhanced: Mark pending messages as delivered with timestamps
                const otherUserId = userId === 'i' ? 'x' : 'i';
                
                (async () => {
                    try {
                        const pendingMessages = await messagesCollection.find({
                            senderID: otherUserId,
                            status: { $in: ['sent'] }
                        }).toArray();
                        
                        if (pendingMessages.length > 0) {
                            for (const message of pendingMessages) {
                                // Update with delivered timestamp
                                await updateMessageStatus(message._id.toString(), 'delivered', 'deliveredAt');
                                
                                // Notify sender with accurate timestamp
                                const senderSocket = activeUsers[otherUserId];
                                if (senderSocket) {
                                    notifyStatusChange(message._id.toString(), 'delivered', senderSocket);
                                }
                            }
                            
                            console.log(`Marked ${pendingMessages.length} messages as delivered for user ${userId}`);
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
                console.error('Error fetching history:', e);
            }
        });
        
        // --- Enhanced Chat Message Event ---
        socket.on('chat message', async (msg) => {
            // Enhanced message with all timestamps
            const enhancedMessage = {
                ...msg,
                status: 'sent',
                timestamp: new Date().toISOString(),
                sentAt: new Date().toISOString(), // Sent timestamp
                deliveredAt: null,
                readAt: null
            };
            
            let result;
            try {
                result = await messagesCollection.insertOne(enhancedMessage);
            } catch (e) {
                console.error('Error saving message:', e);
                return;
            }
            
            // Add the MongoDB ID to the message for tracking
            enhancedMessage._id = result.insertedId;
            
            io.emit('chat message', enhancedMessage); 

            // Update presence for sender
            const sid = msg.senderID || msg.sender;
            if (sid && userPresence[sid]) {
                userPresence[sid].isOnline = true;
                userPresence[sid].lastSeen = new Date().toISOString();
                userPresence[sid].socketId = socket.id;
                broadcastPresenceUpdate();
            }

            // Enhanced: Handle immediate delivery if receiver is online
            const receiverID = sid === 'i' ? 'x' : 'i';
            const receiverSocket = activeUsers[receiverID];
            
            if (receiverSocket) {
                try {
                    // Mark as delivered immediately
                    await updateMessageStatus(result.insertedId.toString(), 'delivered', 'deliveredAt');
                    
                    // Notify sender with delivery confirmation and timestamp
                    notifyStatusChange(result.insertedId.toString(), 'delivered', socket.id);
                    
                } catch (e) {
                    console.error('Error updating immediate delivery status:', e);
                }
            }
        });

        // --- Enhanced Read Receipt Event ---
        socket.on('message read', async (data) => {
            try {
                // Update with read timestamp
                const updateResult = await updateMessageStatus(data.messageID, 'read', 'readAt');
                
                if (updateResult.modifiedCount > 0) {
                    console.log(`Message ${data.messageID} marked as read at ${new Date().toISOString()}`);
                    
                    // Get the message details to notify the correct sender
                    const message = await messagesCollection.findOne({ _id: new ObjectId(data.messageID) });
                    if (message && message.senderID) {
                        const senderSocket = activeUsers[message.senderID];
                        if (senderSocket) {
                            notifyStatusChange(data.messageID, 'read', senderSocket);
                        }
                    }
                }
            } catch (e) {
                console.error('Error marking message as read:', e);
            }
        });

        // --- Delivery Ack Event (for reliability) ---
        socket.on('message delivered', async (data) => {
            try {
                await updateMessageStatus(data.messageID, 'delivered', 'deliveredAt');
                
                // Get message to notify sender
                const message = await messagesCollection.findOne({ _id: new ObjectId(data.messageID) });
                if (message && message.senderID) {
                    const senderSocket = activeUsers[message.senderID];
                    if (senderSocket) {
                        notifyStatusChange(data.messageID, 'delivered', senderSocket);
                    }
                }
            } catch (e) {
                console.error('Error setting delivered status:', e);
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
        console.log(`🚀 Enhanced server listening on port ${port}`);
        console.log(`✅ Features: Accurate timestamps, WhatsApp-style status, No memory leaks`);
        
        // Start periodic presence updates (every 30 seconds)
        setInterval(broadcastPresenceUpdate, 30000);
    }); 
} 

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

connectDB();