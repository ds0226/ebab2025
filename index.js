const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer'); 
const fs = require('fs'); 


// --- MongoDB and Mongoose Integration ---

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://david26:davien1130@ebab.w90ig5m.mongodb.net/?appName=EBAB";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);


mongoose.connect(uri)
  .then(() => console.log('Successfully connected to MongoDB Atlas!'))
  .catch(err => console.error('MongoDB connection error:', err));


// Define the Message Schema and Model
const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { 
        type: String, 
        enum: ['sent', 'delivered', 'read'],
        default: 'sent' 
    }
});

const Message = mongoose.model('Message', MessageSchema);
// ----------------------------------------

// --- Socket.IO and CORS Configuration ---
const externalUrl = process.env.RENDER_EXTERNAL_URL; 

const io = new Server(server, {
    cors: {
        origin: externalUrl || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});
// ----------------------------------------

// Global state for exclusive lock and last seen
const activeUsers = {};
const lastSeenTime = {};
const ALL_USERS = ['x', 'i'];


// --- FILE UPLOAD SETUP (MULTER) ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Create uploads directory if it doesn't exist (CRITICAL for Render)
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        // Use a unique name: sender ID + timestamp + original extension
        const ext = path.extname(file.originalname);
        cb(null, req.body.sender + '-' + Date.now() + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 } // <-- 25MB limit
});

// --- EXPRESS SETUP ---
// Serve the static files (HTML, CSS, client.js)
app.use(express.static(__dirname));
// Serve files from the 'uploads' directory publicly (e.g., /uploads/image.jpg)
app.use('/uploads', express.static(UPLOADS_DIR)); 


// --- NEW UPLOAD API ROUTE ---
app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'No file uploaded.' });
    }
    
    // The public URL for the file will be /uploads/filename.ext
    const fileUrl = '/uploads/' + req.file.filename;

    try {
        // 1. Save the file URL as a new message in MongoDB
        const newMessage = new Message({ 
            sender: req.body.sender, 
            text: fileUrl, // Store the URL in the 'text' field
            status: 'sent' 
        }); 
        const savedMessage = await newMessage.save();

        // 2. Broadcast the message to all clients
        io.emit('chat message', savedMessage); 

        res.status(200).send({ message: 'File uploaded and message sent.', url: fileUrl });
    } catch (e) {
        console.error("Error saving image message to DB:", e);
        res.status(500).send({ message: 'Failed to save image reference to database.' });
    }
});


// --- ROOT ROUTE (unchanged) ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// --- SOCKET.IO REAL-TIME LOGIC ---

// Helper to broadcast the combined online status
const broadcastOnlineStatus = () => {
    const statusMap = {};
    for (const userId of ALL_USERS) { 
        const isOnline = activeUsers.hasOwnProperty(userId);
        statusMap[userId] = {
            online: isOnline,
            lastSeen: lastSeenTime[userId] || null
        };
    }
    io.emit('online-status-update', statusMap);
};

// Helper function to update status and broadcast
const updateMessageStatus = async (messageId, newStatus) => {
    try {
        const updatedMessage = await Message.findByIdAndUpdate(
            messageId,
            { status: newStatus },
            { new: true } 
        );
        if (updatedMessage) {
            io.emit('message status update', updatedMessage);
        }
    } catch (error) {
        console.error(`Error updating message status to ${newStatus}:`, error);
    }
};

io.on('connection', async (socket) => {
  console.log('A user connected');

  socket.emit('user-lock-status', activeUsers);
  broadcastOnlineStatus();

  try {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(100);
    socket.emit('history', messages); 
  } catch (error) {
    console.error("Error loading chat history:", error);
  }

  socket.on('set user', (userId) => {
    if (!ALL_USERS.includes(userId)) return;
    if (activeUsers[userId] && activeUsers[userId] !== socket.id) {
        socket.emit('user taken', { userId: userId });
        return;
    }
    const previousUserId = socket.data.userId;
    if (previousUserId && activeUsers[previousUserId] === socket.id) {
        delete activeUsers[previousUserId];
        lastSeenTime[previousUserId] = Date.now();
    }
    activeUsers[userId] = socket.id;
    socket.data.userId = userId;
    io.emit('user-lock-status', activeUsers);
    broadcastOnlineStatus();
  });


  socket.on('chat message', async (msgData) => {
    // CRITICAL: Check if the sender is authorized with this socket
    if (!socket.data.userId || socket.data.userId !== msgData.sender) { 
        console.warn(`Message blocked: Sender ${msgData.sender} is not authorized or assigned.`);
        return;
    }
    try {
       const newMessage = new Message({ ...msgData, status: 'sent' }); 
       const savedMessage = await newMessage.save();
       io.emit('chat message', savedMessage); 
    } catch (e) { 
        console.error("Error saving message:", e); 
    }
  });

  socket.on('message delivered', (data) => {
      updateMessageStatus(data.messageId, 'delivered');
  });

  socket.on('message read', (data) => {
      updateMessageStatus(data.messageId, 'read');
  });
  
  socket.on('delete multiple messages', async (data) => {
    const { messageIds, senderId } = data;
    if (senderId !== 'x' || socket.data.userId !== 'x' || !Array.isArray(messageIds) || messageIds.length === 0) {
        console.warn(`Deletion attempt blocked.`);
        return;
    }
    try {
        const result = await Message.deleteMany({ _id: { $in: messageIds } });
        if (result.deletedCount > 0) {
            io.emit('message deleted', { messageIds: messageIds });
        }
    } catch (error) {
        console.error("Error deleting messages:", error);
    }
  });


  socket.on('disconnect', () => {
    const userId = socket.data.userId; 
    if (userId && activeUsers[userId] === socket.id) {
        delete activeUsers[userId];
        lastSeenTime[userId] = Date.now();
        io.emit('user-lock-status', activeUsers);
        broadcastOnlineStatus();
    }
  });
});


// --- Server Start Logic ---

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; 

server.listen(PORT, HOST, () => { 
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Live app URL: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}`);
});