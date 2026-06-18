// server.js - Sets up Express, Socket.IO, and MongoDB for persistence,
//             user exclusivity, file upload, and real-time read receipts.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
// Import ObjectId to use with MongoDB updates
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); 
const multer = require('multer'); 
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();         

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// --- Cloudinary Configuration ---
console.log("DEBUG: Cloudinary Config:", {
    cloud_name: !!process.env.CLOUD_NAME,
    api_key: !!process.env.API_KEY,
    api_secret: !!process.env.CLOUDINARY_API_SECRET
});

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'ebab2025_chat_uploads',
        format: async (req, file) => 'jpg',
        public_id: (req, file) => Date.now() + '-' + file.originalname.replace(/[^a-z0-9.]/gi, '_')
    },
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
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
        const host = req.headers.host || '';
        const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
        const ok = origin
            ? Array.from(allowedOrigins).some(o => origin && origin.startsWith(o))
            : isLocalHost;
        callback(null, ok);
    },
    pingInterval: 5000,
    pingTimeout: 12000
}); 

// --- MongoDB Configuration ---
const uri = process.env.MONGO_URI || "mongodb+srv://davidsonsolomon26:Davien11@ebab.4fbr6fo.mongodb.net/?appName=ebab"; 
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

async function dbFindAll(options = {}) {
    const { limit = null, before, after } = options;
    let query = {};
    
    // Use cursor-based pagination with 'before' timestamp
    if (before) {
        query.timestamp = { $lt: new Date(before) };
    }
    
    if (after) {
        if (query.timestamp) {
            query.timestamp.$gt = new Date(after);
        } else {
            query.timestamp = { $gt: new Date(after) };
        }
    }
    
    if (useMemoryStore || !messagesCollection) {
        let results = [...messagesMemory];
        
        // Filter by timestamp if 'before' is provided
        if (before) {
            results = results.filter(msg => new Date(msg.timestamp) < new Date(before));
        }
        
        if (after) {
            results = results.filter(msg => new Date(msg.timestamp) > new Date(after));
        }
        
        // Sort by timestamp descending (newest first)
        results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Apply limit if specified
        if (limit) {
            results = results.slice(0, limit);
        }
        return results;
    }
    
    // For MongoDB - use cursor-based pagination with 'before' timestamp
    let cursor = messagesCollection.find(query)
        .sort({ timestamp: -1 }) // Sort by timestamp descending (newest first)
        .hint({ timestamp: 1 }); // Use timestamp index
    
    if (limit) {
        cursor = cursor.limit(limit);
    }
    
    return await cursor.toArray();
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

// Helper that supports legacy records with `sender` or `senderID`
async function dbFindIdsBySenderStatus(senderId, status) {
    if (useMemoryStore || !messagesCollection) {
        return messagesMemory
            .filter(m => (m.senderID === senderId || m.sender === senderId) && m.status === status)
            .map(m => ({ _id: m._id }));
    }
    return await messagesCollection
        .find({ status, $or: [{ senderID: senderId }, { sender: senderId }] })
        .project({ _id: 1 })
        .toArray();
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

function recalcPresence(userId) {
    const sid = activeUsers[userId];
    const sock = sid ? io.sockets.sockets.get(sid) : null;
    const connected = !!(sock && sock.connected);
    userPresence[userId].isOnline = connected;
    userPresence[userId].socketId = connected ? sid : null;
    if (connected) {
        userPresence[userId].lastSeen = new Date().toISOString();
    }
}
// --- Server and Socket.IO Logic ---
function startServerLogic() {
    const serverStartTime = new Date();
    
    // Performance monitoring
    let requestCount = 0;
    let lastActivity = Date.now();
    
    app.use(express.static(path.join(__dirname, 'ebab2025')));
    app.use('/uploads', express.static('uploads'));

    app.get('/health', (req, res) => {
        requestCount++;
        lastActivity = Date.now();
        const uptime = Date.now() - serverStartTime.getTime();
        const uptimeMinutes = Math.floor(uptime / 60000);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        
        res.status(200).json({
            status: 'OK',
            uptime: `${uptimeHours}h ${uptimeMinutes % 60}m`,
            uptimeMs: uptime,
            requestCount: requestCount,
            serverStart: serverStartTime.toISOString(),
            lastActivity: new Date(lastActivity).toISOString(),
            memory: process.memoryUsage(),
            nodeVersion: process.version
        });
    });

    // Endpoint to get paginated messages
    app.get('/api/messages', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            
            const messages = await dbFindAll({
                limit: limit,
                page: page
            });
            
            // IMPORTANT: Reverse before sending for chronological order (oldest at top)
            const chronologicalMessages = messages.reverse();
            res.json(chronologicalMessages);
        } catch (error) {
            console.error('Error fetching messages:', error);
            res.status(500).json({ error: 'Failed to fetch messages' });
        }
    });

    // Debug middleware for /upload requests
    app.use((req, res, next) => {
        if (req.path === '/upload') {
            console.log("DEBUG: Incoming request to /upload");
        }
        next();
    });

    // HTTP endpoint for file uploads
    app.post('/upload', upload.single('mediaFile'), (req, res) => {
        console.log("DEBUG: Reached the /upload route handler. File exists:", !!req.file);

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Assuming multer-storage-cloudinary attaches the path to req.file.path
        console.log("DEBUG: File uploaded successfully to:", req.file.path);
        res.status(200).json({ url: req.file.path });
    });

    // HTTP endpoint for explicit offline notification (used with beforeunload)
    app.post('/api/user-offline', express.json(), (req, res) => {
        const { userId } = req.body;
        if (userId && userPresence[userId]) {
            userPresence[userId].isOnline = false;
            userPresence[userId].lastSeen = new Date().toISOString();
            userPresence[userId].socketId = null;
            
            if (activeUsers[userId]) {
                activeUsers[userId] = null;
            }
            
            console.log(`User ${userId} explicitly marked as offline via beforeunload`);
            broadcastPresenceUpdate();
            
            const inUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
            io.emit('available users', inUseList);
        }
        res.status(200).send();
    });

    // Global error handling middleware
    app.use((err, req, res, next) => {
        console.error("DEBUG: GLOBAL ERROR HANDLER -", err);
        res.status(400).json({ error: err.message });
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
            const messagesHistory = (await dbFindAll({ limit: 20, page: 1 })).map(m => ({ ...m, _id: String(m._id) }));
            // Reverse to chronological order (oldest first) before sending
            const chronologicalMessages = messagesHistory.reverse();
            socket.emit('history', chronologicalMessages);
        } catch (e) {
            console.error('Error fetching history:', e);
        }

        // --- User Selection Event ---
        socket.on('select user', (userId) => {
            if (activeUsers[userId] === null) {
                activeUsers[userId] = socket.id;
                
                userPresence[userId].socketId = socket.id;
                recalcPresence(userId);
                
                socket.emit('user selected', true);
                console.log(`User ${userId} is now online`);
                
                // Broadcast presence update
                broadcastPresenceUpdate();

                // When a user comes online, mark pending messages to them as delivered
                // Example: if 'x' came online, mark messages from 'i' with status 'sent' as delivered
                const otherUserId = userId === 'i' ? 'x' : 'i';
                (async () => {
                    try {
                        const pending = await dbFindIdsBySenderStatus(otherUserId, 'sent');
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

        // --- Explicit Offline Notification Event ---
        socket.on('user going offline', (data) => {
            const userId = data.userId;
            if (userId && userPresence[userId]) {
                userPresence[userId].isOnline = false;
                userPresence[userId].lastSeen = new Date().toISOString();
                userPresence[userId].socketId = null;
                
                if (activeUsers[userId]) {
                    activeUsers[userId] = null;
                }
                
                console.log(`User ${userId} explicitly marked as offline via socket event`);
                broadcastPresenceUpdate();
                
                const inUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
                io.emit('available users', inUseList);
            }
        });

        // --- Get History (for periodic refresh) ---
        socket.on('get history', async (data) => {
                try {
                    const before = data?.before;
                    const limit = data?.limit || 20;

                    console.log("SERVER LOG: received get history with data:", JSON.stringify(data));
                    console.log("SERVER LOG: before:", before);
                    console.log("SERVER LOG: limit:", limit);

                    let query = {};

                    if (before) {
                        console.log("SERVER LOG: Received request for history before:", before);
                        // Apply $lt filter to accommodate both standard Strings or formal Date objects
                        query.timestamp = {
                            $lt: before
                        };
                        console.log("SERVER LOG: Query constructed:", JSON.stringify(query));
                    }

                    let messagesHistory;
                    if (useMemoryStore || !messagesCollection) {
                        // In-memory fallback
                        messagesHistory = [...messagesMemory];
                        if (before) {
                            messagesHistory = messagesHistory.filter(msg => new Date(msg.timestamp) < new Date(before));
                        }
                        messagesHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                        messagesHistory = messagesHistory.slice(0, limit);
                    } else {
                        // Fetch logs strictly sorted by timestamp descending, limiting to 20
                        messagesHistory = await messagesCollection
                            .find(query)
                            .sort({ timestamp: -1 })
                            .limit(limit)
                            .toArray();
                    }
                    
                    messagesHistory = messagesHistory.map(m => ({ ...m, _id: String(m._id) }));
                    console.log(`SERVER LOG: Emitted ${messagesHistory.length} historical messages back to client.`);
                    if (messagesHistory.length > 0) {
                        console.log("SERVER LOG: first message timestamp:", messagesHistory[0].timestamp);
                        console.log("SERVER LOG: last message timestamp:", messagesHistory[messagesHistory.length - 1].timestamp);
                    }
                    
                    // Reverse to chronological order (oldest first) before sending
                    const chronologicalMessages = messagesHistory.reverse();
                    socket.emit('history', chronologicalMessages);
                } catch (err) {
                    console.error("SERVER ERROR inside get history handler:", err);
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
                if (activeUsers[sid] === null) {
                    activeUsers[sid] = socket.id;
                }
                userPresence[sid].socketId = socket.id;
                recalcPresence(sid);
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
                    const pendingOpp = await dbFindIdsBySenderStatus(otherUserId, 'sent');
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
                    const deliveredToReader = await dbFindIdsBySenderStatus(otherUserId, 'delivered');
                    if (deliveredToReader.length > 0) {
                        const idsRead = deliveredToReader.map(doc => doc._id);
                        await dbUpdateManyByIds(idsRead, { $set: { status: 'read' } });
                        console.log('Reply read upgrade:', { reader: sid, count: idsRead.length });
                        idsRead.forEach(id => {
                            io.emit('message status update', { messageID: String(id), status: 'read' });
                        });
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
                userPresence[rid].socketId = socket.id;
                recalcPresence(rid);
                broadcastPresenceUpdate();
            }
        });

        socket.on('messages read', async (data) => {
            if (!rateLimit(socket, 'read')) return;
            const rid = data.readerID;
            if (!rid || activeUsers[rid] !== socket.id) return;
            const ids = Array.isArray(data.messageIDs) ? data.messageIDs : [];
            if (ids.length === 0) return;
            try {
                const objIds = ids.map(id => new ObjectId(id));
                await dbUpdateManyByIds(objIds, { $set: { status: 'read' } });
            } catch (_) { return; }
            ids.forEach(id => {
                io.emit('message status update', { messageID: String(id), status: 'read' });
            });
            if (rid && userPresence[rid]) {
                userPresence[rid].socketId = socket.id;
                recalcPresence(rid);
                broadcastPresenceUpdate();
            }
        });

        socket.on('mark conversation read', async (data) => {
            if (!rateLimit(socket, 'read')) return;
            const rid = data.readerID;
            if (!rid || activeUsers[rid] !== socket.id) return;
            const otherId = rid === 'i' ? 'x' : 'i';
            try {
                const pendingSent = await dbFindIdsBySenderStatus(otherId, 'sent');
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
                const pendingDelivered = await dbFindIdsBySenderStatus(otherId, 'delivered');
                const deliveredIds = pendingDelivered.map(d => d._id);
                const toRead = [...sentIds, ...deliveredIds];
                if (toRead.length > 0) {
                    await dbUpdateManyByIds(toRead, { $set: { status: 'read' } });
                    console.log('Mark conversation read:', {
                        reader: rid,
                        upgradedSentToDelivered: sentIds.length,
                        markedRead: toRead.length
                    });
                    toRead.forEach(id => {
                        io.emit('message status update', { messageID: String(id), status: 'read' });
                    });
                }
                if (userPresence[rid]) {
                    userPresence[rid].socketId = socket.id;
                    recalcPresence(rid);
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
                userPresence[receiverId].socketId = socket.id;
                recalcPresence(receiverId);
                broadcastPresenceUpdate();
            }
        });

        socket.on('messages delivered', async (data) => {
            if (!rateLimit(socket, 'delivered')) return;
            const senderId = data.senderID;
            const receiverId = senderId === 'i' ? 'x' : 'i';
            if (activeUsers[receiverId] !== socket.id) return;
            const ids = Array.isArray(data.messageIDs) ? data.messageIDs : [];
            if (ids.length === 0) return;
            try {
                const objIds = ids.map(id => new ObjectId(id));
                await dbUpdateManyByIds(objIds, { $set: { status: 'delivered' } });
            } catch (_) { return; }
            const senderSocket = activeUsers[senderId];
            if (senderSocket) {
                ids.forEach(id => {
                    io.to(senderSocket).emit('message delivered', { messageID: String(id) });
                });
            }
            if (userPresence[receiverId]) {
                userPresence[receiverId].socketId = socket.id;
                recalcPresence(receiverId);
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
                if (activeUsers[data.userID] === null) {
                    activeUsers[data.userID] = socket.id;
                }
                userPresence[data.userID].socketId = socket.id;
                recalcPresence(data.userID);
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
        console.log(`Server started at: ${serverStartTime.toISOString()}`);
        
        // Start periodic presence updates (every 30 seconds)
        setInterval(broadcastPresenceUpdate, 30000);

        setInterval(reconcilePresence, 10000);

        // 24/7 Keep-alive mechanism - prevent sleep
        setInterval(() => {
            const now = Date.now();
            const uptime = now - serverStartTime.getTime();
            const uptimeMinutes = Math.floor(uptime / 60000);
            
            console.log(`🟢 Server alive - Uptime: ${Math.floor(uptimeMinutes / 60)}h ${uptimeMinutes % 60}m | Requests: ${requestCount} | Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
            
            // Keep server warm
            lastActivity = now;
        }, 60000); // Every minute

        // Self-ping to prevent connection timeouts
        setInterval(() => {
            const http = require('http');
            const options = {
                hostname: 'localhost',
                port: port,
                path: '/health',
                method: 'GET',
                timeout: 5000
            };
            
            const req = http.request(options, (res) => {
                res.on('data', () => {});
                res.on('end', () => {
                    console.log('🔄 Self-ping successful');
                });
            });
            
            req.on('error', (err) => {
                console.log('❌ Self-ping failed:', err.message);
            });
            
            req.setTimeout(5000, () => {
                req.destroy();
                console.log('⏰ Self-ping timeout');
            });
            
            req.end();
        }, 300000); // Every 5 minutes

        console.log('🚀 24/7 monitoring enabled - Keep-alive systems active');
    });
}

if (!uri) {
    useMemoryStore = true;
    console.warn("MONGO_URI not set; using in-memory store.");
    startServerLogic();
} else {
    connectDB();
}
