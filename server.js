// server.js - Sets up Express, Socket.IO, and MongoDB for persistence,
//             user exclusivity, file upload, and real-time read receipts.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
// Import ObjectId to use with MongoDB updates
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

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = new Set([
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/gif',
            'video/mp4',
            'video/webm',
            'application/pdf'
        ]);
        cb(null, allowed.has(file.mimetype));
    }
});


// --- Socket.IO CORS ---
const allowedOrigins = new Set([
    process.env.ALLOWED_ORIGIN || 'https://ebab2025.onrender.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
]);

const io = new Server(server, {
    cors: {
        origin: Array.from(allowedOrigins), 
        methods: ["GET", "POST"]
    },
    allowRequest: (req, callback) => {
        const origin = req.headers.origin || req.headers.referer || '';
        const ok = Array.from(allowedOrigins).some(o => origin && origin.startsWith(o));
        callback(null, ok);
    },
    pingInterval: 5000,
    pingTimeout: 12000
}); 

// --- MongoDB Configuration ---
const uri = process.env.MONGO_URI; 
const dbName = "chatAppDB"; 
const collectionName = "messages";
let messagesCollection; 
let useMemoryStore = false;
let messagesMemory = [];

const MAX_MESSAGE_CHARS = 4096;
const ALLOWED_MESSAGE_TYPES = new Set(['text','image','video','document']);
const RATE_LIMIT_WINDOW_MS = 30000;
const RATE_LIMIT_MAX = 25;
const socketEventWindows = new Map();

function rateLimit(socket, key) {
    const now = Date.now();
    let w = socketEventWindows.get(socket.id);
    if (!w) { w = {}; socketEventWindows.set(socket.id, w); }
    if (!w[key]) w[key] = [];
    w[key] = w[key].filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (w[key].length >= RATE_LIMIT_MAX) return false;
    w[key].push(now);
    return true;
}

function isValidMessagePayload(msg) {
    const sid = msg.senderID || msg.sender;
    if (sid !== 'i' && sid !== 'x') return false;
    if (!ALLOWED_MESSAGE_TYPES.has(msg.type)) return false;
    if (typeof msg.message !== 'string') return false;
    if (msg.message.length === 0) return false;
    if (msg.message.length > MAX_MESSAGE_CHARS) msg.message = msg.message.slice(0, MAX_MESSAGE_CHARS);
    return true;
}

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


// --- MongoDB Connection Logic ---
async function connectDB() {
    const client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    });

    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
        
        const db = client.db(dbName);
        messagesCollection = db.collection(collectionName);
        try {
            await messagesCollection.createIndexes([
                { key: { status: 1, senderID: 1 } },
                { key: { timestamp: 1 } }
            ]);
        } catch (_) {}
        
        startServerLogic(); 

    } catch (e) {
        useMemoryStore = true;
        console.warn("MongoDB connection failed; switching to in-memory store.");
        startServerLogic();
    }
}

async function dbFindAll() {
    if (useMemoryStore || !messagesCollection) return [...messagesMemory];
    return await messagesCollection.find({}).toArray();
}

async function dbInsert(msg) {
    if (useMemoryStore || !messagesCollection) {
        const id = new ObjectId();
        msg._id = id;
        messagesMemory.push(msg);
        return { insertedId: id };
    }
    const result = await messagesCollection.insertOne(msg);
    return result;
}

async function dbUpdateOne(id, set) {
    if (useMemoryStore || !messagesCollection) {
        messagesMemory = messagesMemory.map(m => {
            if (String(m._id) === String(id)) return { ...m, ...set.$set };
            return m;
        });
        return { modifiedCount: 1 };
    }
    return await messagesCollection.updateOne({ _id: id }, set);
}

async function dbUpdateManyByIds(ids, set) {
    if (useMemoryStore || !messagesCollection) {
        const idSet = new Set(ids.map(id => String(id)));
        messagesMemory = messagesMemory.map(m => idSet.has(String(m._id)) ? { ...m, ...set.$set } : m);
        return { modifiedCount: ids.length };
    }
    return await messagesCollection.updateMany({ _id: { $in: ids } }, set);
}

async function dbFindIdsByQuery(query) {
    if (useMemoryStore || !messagesCollection) {
        return messagesMemory.filter(m => {
            for (const k in query) {
                if (m[k] !== query[k]) return false;
            }
            return true;
        }).map(m => ({ _id: m._id }));
    }
    return await messagesCollection.find(query).project({ _id: 1 }).toArray();
}

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

function reconcilePresence() {
    for (const userId in userPresence) {
        const sid = userPresence[userId].socketId;
        const sock = sid ? io.sockets.sockets.get(sid) : null;
        const connected = !!(sock && sock.connected);
        if (!connected) {
            if (userPresence[userId].isOnline) {
                userPresence[userId].isOnline = false;
                if (!userPresence[userId].lastSeen) {
                    userPresence[userId].lastSeen = new Date().toISOString();
                }
            }
            userPresence[userId].socketId = null;
            if (activeUsers[userId] && activeUsers[userId] === sid) {
                activeUsers[userId] = null;
            }
        }
    }
    broadcastPresenceUpdate();
}

// --- Server and Socket.IO Logic ---
function startServerLogic() {
    app.use(express.static(path.join(__dirname)));
    app.use('/uploads', express.static('uploads'));

    app.get('/health', (req, res) => {
        res.status(200).send('OK');
    });

    // HTTP endpoint for file uploads
    app.post('/upload', (req, res) => {
        upload.single('mediaFile')(req, res, (err) => {
            if (err) {
                return res.status(400).json({ error: err.message });
            }
            if (!req.file) {
                return res.status(400).send('No file uploaded.');
            }
            const fileURL = '/uploads/' + req.file.filename;
            const mimeType = req.file.mimetype;
            let fileType = 'document';
            if (mimeType.startsWith('image')) {
                fileType = 'image';
            } else if (mimeType.startsWith('video')) {
                fileType = 'video';
            }
            res.json({ url: fileURL, type: fileType });
        });
    });


    io.on('connection', async (socket) => {
        const origin = socket.handshake.headers.origin || socket.handshake.headers.referer || '';
        const ua = socket.handshake.headers['user-agent'] || '';
        console.log('Socket connected:', socket.id, origin, ua);

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
            const messagesHistory = (await dbFindAll()).map(m => ({ ...m, _id: String(m._id) }));
            socket.emit('history', messagesHistory);
        } catch (e) {
            console.error('Error fetching history:', e);
        }

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

                // When a user comes online, mark pending messages to them as delivered
                // Example: if 'x' came online, mark messages from 'i' with status 'sent' as delivered
                const otherUserId = userId === 'i' ? 'x' : 'i';
                (async () => {
                    try {
                        const pending = await dbFindIdsByQuery({ status: 'sent', senderID: otherUserId });
                        if (pending.length > 0) {
                            const ids = pending.map(doc => doc._id);
                            await dbUpdateManyByIds(ids, { $set: { status: 'delivered' } });
                            const senderSocket = activeUsers[otherUserId];
                            if (senderSocket) {
                                ids.forEach(id => {
                                    io.to(senderSocket).emit('message delivered', { messageID: String(id) });
                                });
                            }
                        }
                    } catch (e) {
                        console.error('Error marking pending messages as delivered on user online:', e);
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

        // --- Get History (for periodic refresh) ---
        socket.on('get history', async () => {
                try {
                    const messagesHistory = (await dbFindAll()).map(m => ({ ...m, _id: String(m._id) }));
                    socket.emit('history', messagesHistory);
                } catch (e) {
                    console.error('Error fetching history (get history):', e);
                }
            });
        
        // --- Chat Message Event ---
        socket.on('chat message', async (msg) => {
            if (!rateLimit(socket, 'chat')) return;
            if (!isValidMessagePayload(msg)) return;
            // Add initial status and save
            msg.status = 'sent';
            let result;
            try {
                result = await dbInsert(msg);
                console.log(`Message (Type: ${msg.type}) saved to DB.`);
                // CRITICAL: Add the MongoDB _id back to the message object before broadcasting
                msg._id = String(result.insertedId);
            } catch (e) {
                console.error('Error saving message:', e);
            }
            
            io.emit('chat message', msg); 

            // Robust presence update: mark sender online with latest activity
            const sid = msg.senderID || msg.sender;
            if (sid && userPresence[sid]) {
                userPresence[sid].isOnline = true;
                userPresence[sid].lastSeen = new Date().toISOString();
                userPresence[sid].socketId = socket.id;
                broadcastPresenceUpdate();
            }

            // Delivery status: if receiver is online, mark delivered and notify sender
            const receiverID = sid === 'i' ? 'x' : 'i';
            const receiverOnline = activeUsers[receiverID] !== null;
            if (receiverOnline) {
                try {
                    await dbUpdateOne(result.insertedId, { $set: { status: 'delivered' } });
                } catch (e) {
                    console.error('Error updating message to delivered:', e);
                }
                socket.emit('message delivered', { messageID: String(result.insertedId) });
            }

            (async () => {
                try {
                    const otherUserId = sid === 'i' ? 'x' : 'i';
                    const pendingOpp = await dbFindIdsByQuery({ status: 'sent', senderID: otherUserId });
                    if (pendingOpp.length > 0) {
                        const ids = pendingOpp.map(doc => doc._id);
                        await dbUpdateManyByIds(ids, { $set: { status: 'delivered' } });
                        const otherSocket = activeUsers[otherUserId];
                        if (otherSocket) {
                            ids.forEach(id => {
                                io.to(otherSocket).emit('message delivered', { messageID: String(id) });
                            });
                        }
                    }
                } catch (_) {}
            })();
        });

        // --- Read Receipt Event (NEW) ---
        socket.on('message read', async (data) => {
            if (!rateLimit(socket, 'read')) return;
            const rid = data.readerID;
            if (!rid || activeUsers[rid] !== socket.id) {
                return;
            }
            
            // 1. Update the message status in the database
            try {
                const updateResult = await dbUpdateOne(new ObjectId(data.messageID), { $set: { status: 'read' } });
                
                if (updateResult.modifiedCount > 0) {
                    console.log(`Message ${data.messageID} marked as read.`);
                }
            } catch (e) {
                console.error('Error updating message status:', e);
                return;
            }
            
            // 2. Notify the sender (all clients) of the status change
            io.emit('message status update', { 
                messageID: String(data.messageID),
                status: 'read'
            });

            // 3. Presence: mark reader online with latest activity
            if (rid && userPresence[rid]) {
                userPresence[rid].isOnline = true;
                userPresence[rid].lastSeen = new Date().toISOString();
                userPresence[rid].socketId = socket.id;
                broadcastPresenceUpdate();
            }
        });

        socket.on('mark conversation read', async (data) => {
            if (!rateLimit(socket, 'read')) return;
            const rid = data.readerID;
            if (!rid || activeUsers[rid] !== socket.id) return;
            const otherId = rid === 'i' ? 'x' : 'i';
            try {
                const pendingSent = await dbFindIdsByQuery({ senderID: otherId, status: 'sent' });
                const sentIds = pendingSent.map(d => d._id);
                if (sentIds.length > 0) {
                    await dbUpdateManyByIds(sentIds, { $set: { status: 'delivered' } });
                    const senderSocket = activeUsers[otherId];
                    if (senderSocket) {
                        sentIds.forEach(id => {
                            io.to(senderSocket).emit('message delivered', { messageID: String(id) });
                        });
                    }
                }
                const pendingDelivered = await dbFindIdsByQuery({ senderID: otherId, status: 'delivered' });
                const deliveredIds = pendingDelivered.map(d => d._id);
                const toRead = [...sentIds, ...deliveredIds];
                if (toRead.length > 0) {
                    await dbUpdateManyByIds(toRead, { $set: { status: 'read' } });
                    toRead.forEach(id => {
                        io.emit('message status update', { messageID: String(id), status: 'read' });
                    });
                }
                if (userPresence[rid]) {
                    userPresence[rid].isOnline = true;
                    userPresence[rid].lastSeen = new Date().toISOString();
                    userPresence[rid].socketId = socket.id;
                    broadcastPresenceUpdate();
                }
            } catch (_) {}
        });

        // --- Delivery Ack from Receiver ---
        socket.on('message delivered', async (data) => {
            if (!rateLimit(socket, 'delivered')) return;
            const senderId = data.senderID;
            const receiverId = senderId === 'i' ? 'x' : 'i';
            if (activeUsers[receiverId] !== socket.id) {
                return;
            }
            try {
                await dbUpdateOne(new ObjectId(data.messageID), { $set: { status: 'delivered' } });
            } catch (e) {
                console.error('Error setting delivered status:', e);
                return;
            }
            const senderSocket = activeUsers[senderId];
            if (senderSocket) {
                io.to(senderSocket).emit('message delivered', { messageID: String(data.messageID) });
            }

            // Presence: infer receiver is the opposite of sender in a 2-user chat
            if (userPresence[receiverId]) {
                userPresence[receiverId].isOnline = true;
                userPresence[receiverId].lastSeen = new Date().toISOString();
                userPresence[receiverId].socketId = socket.id;
                broadcastPresenceUpdate();
            }
        });

        socket.on('typing', (data) => {
            const otherUserId = data.userID === 'i' ? 'x' : 'i';
            const otherSocket = activeUsers[otherUserId];
            if (otherSocket) {
                io.to(otherSocket).emit('typing', { userID: data.userID, isTyping: data.isTyping });
            }

            if (userPresence[data.userID]) {
                userPresence[data.userID].isOnline = true;
                userPresence[data.userID].lastSeen = new Date().toISOString();
                userPresence[data.userID].socketId = socket.id;
                broadcastPresenceUpdate();
            }
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
        console.log(`Server listening on port ${port}`);
        
        // Start periodic presence updates (every 30 seconds)
        setInterval(broadcastPresenceUpdate, 30000);

        setInterval(reconcilePresence, 10000);

        // External uptime monitors should ping /health; no internal ping is started.
    });
}

if (!uri) {
    useMemoryStore = true;
    console.warn("MONGO_URI not set; using in-memory store.");
    startServerLogic();
} else {
    connectDB();
}
