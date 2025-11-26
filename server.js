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
        lastSeen: null,
        socketId: null 
    },
    'x': { 
        isOnline: false, 
        lastSeen: null,
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
        
        startServerLogic(); 

    } catch (e) {
        console.error("--- MONGODB CONNECTION FAILED ---");
        console.error("Could not connect to MongoDB. Error details:", e.message);
        process.exit(1); 
    }
}

// --- Helper Functions ---
function getTimeAgo(timestamp) {
    if (!timestamp) return null;
    
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
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

// --- Server and Socket.IO Logic ---
function startServerLogic() {
    app.use(express.static(path.join(__dirname)));
    app.use('/uploads', express.static('uploads'));

    // HTTP endpoint for file uploads
    app.post('/upload', upload.single('mediaFile'), (req, res) => {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }
        const fileURL = '/uploads/' + req.file.filename;
        const mimeType = req.file.mimetype;
        let fileType = 'text'; 

        if (mimeType.startsWith('image')) {
            fileType = 'image';
        } else if (mimeType.startsWith('video')) {
            fileType = 'video';
        } else if (mimeType === 'application/pdf') {
            fileType = 'document';
        }
        
        res.json({ url: fileURL, type: fileType });
    });


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
            // Include status in history (messages default to 'sent' if status field is missing)
            const messagesHistory = await messagesCollection.find({}).toArray();
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
            // Add initial status and save
            msg.status = 'sent';
            let result;
            try {
                result = await messagesCollection.insertOne(msg);
                console.log(`Message (Type: ${msg.type}) saved to DB.`);
                // CRITICAL: Add the MongoDB _id back to the message object before broadcasting
                msg._id = result.insertedId;
            } catch (e) {
                console.error('Error saving message:', e);
            }
            
            io.emit('chat message', msg); 
        });

        // --- Read Receipt Event (NEW) ---
        socket.on('message read', async (data) => {
            
            // 1. Update the message status in the database
            try {
                const updateResult = await messagesCollection.updateOne(
                    { _id: new ObjectId(data.messageID) },
                    { $set: { status: 'read' } }
                );
                
                if (updateResult.modifiedCount > 0) {
                    console.log(`Message ${data.messageID} marked as read.`);
                }
            } catch (e) {
                console.error('Error updating message status:', e);
                return;
            }
            
            // 2. Notify the sender (all clients) of the status change
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
        console.log(`Server listening on port ${port}`);
        
        // Start periodic presence updates (every 30 seconds)
        setInterval(broadcastPresenceUpdate, 30000);
    });
} 

connectDB();