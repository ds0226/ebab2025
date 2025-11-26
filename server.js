// server.js - Sets up Express, Socket.IO, and MongoDB for persistence,
//             user exclusivity, and file upload handling (using Multer).

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient, ServerApiVersion } = require('mongodb'); 
const multer = require('multer'); // NEW: For handling file uploads
const fs = require('fs');         // NEW: For file system operations (optional, but good practice)

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// --- Multer Configuration for File Storage ---
// IMPORTANT: Ensure an 'uploads' directory exists in your project root.
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create 'uploads' directory if it doesn't exist
        if (!fs.existsSync('./uploads')) {
            fs.mkdirSync('./uploads');
        }
        cb(null, './uploads/'); 
    },
    filename: function (req, file, cb) {
        // Use a unique name (timestamp + original name)
        cb(null, Date.now() + '-' + file.originalname.replace(/[^a-z0-9.]/gi, '_'));
    }
});

const upload = multer({ storage: storage });


// IMPORTANT: CORS setup for Socket.IO
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

// --- Server and Socket.IO Logic ---
function startServerLogic() {
    // Serve static files (HTML, CSS, JS)
    app.use(express.static(path.join(__dirname)));
    
    // NEW: Serve the uploaded files statically
    app.use('/uploads', express.static('uploads'));

    // NEW: HTTP endpoint for file uploads using Multer
    app.post('/upload', upload.single('mediaFile'), (req, res) => {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const fileURL = '/uploads/' + req.file.filename;
        const mimeType = req.file.mimetype;

        let fileType = 'text'; // Default to text, though this route is for files

        if (mimeType.startsWith('image')) {
            fileType = 'image';
        } else if (mimeType.startsWith('video')) {
            fileType = 'video';
        } else if (mimeType === 'application/pdf') {
            fileType = 'document';
        }
        
        // Send back the URL and type for the client to broadcast via Socket.IO
        res.json({ 
            url: fileURL, 
            type: fileType 
        });
    });


    io.on('connection', async (socket) => {
        console.log('A user connected:', socket.id);

        // 1. Initial State: Send the current list of active users to the new client
        const initialInUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
        socket.emit('available users', initialInUseList); 

        // 2. Load History: Retrieve all messages from the database
        try {
            const messagesHistory = await messagesCollection.find({}).toArray();
            socket.emit('history', messagesHistory);
        } catch (e) {
            console.error('Error fetching history:', e);
        }

        // --- User Selection Event ---
        socket.on('select user', (userId) => {
            console.log(`Received selection attempt for user: ${userId} from socket: ${socket.id}`); 
            
            if (userId !== 'i' && userId !== 'x') {
                 socket.emit('user selected', false);
                 console.log(`Selection failed: Invalid user ID received: ${userId}`);
                 return;
            }

            if (activeUsers[userId] === null) {
                activeUsers[userId] = socket.id;
                
                socket.emit('user selected', true);
                console.log(`${userId} selected by ${socket.id}`);

            } else {
                socket.emit('user selected', false);
                console.log(`Selection failed: ${userId} is already taken.`);
            }
            
            const inUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
            io.emit('available users', inUseList);
        });
        
        // --- Chat Message Event ---
        socket.on('chat message', async (msg) => {
            try {
                // The message object now includes 'type' (text, image, video, document)
                await messagesCollection.insertOne(msg);
                console.log(`Message (Type: ${msg.type}) saved to DB.`);
            } catch (e) {
                console.error('Error saving message:', e);
            }
            
            io.emit('chat message', msg); 
        });

        // --- Disconnect/Deselection Event ---
        socket.on('disconnect', () => {
            console.log('A user disconnected:', socket.id);
            
            const disconnectedUser = Object.keys(activeUsers).find(key => activeUsers[key] === socket.id);
            
            if (disconnectedUser) {
                activeUsers[disconnectedUser] = null; 
                console.log(`User ${disconnectedUser} slot freed.`); 
                
                const inUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
                io.emit('available users', inUseList);
            }
        }); 
    }); 

    server.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
} 

// Initiate the database connection and start the server logic
connectDB();