const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const path = require('path');


// --- MongoDB and Mongoose Integration ---
const mongoose = require('mongoose');

// Use environment variable MONGO_URI for deployment security, fallback to hardcoded for local testing.

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


// **Mongoose is the preferred method for connecting**
mongoose.connect(uri)
  .then(() => console.log('Successfully connected to MongoDB Atlas!'))
  .catch(err => console.error('MongoDB connection error:', err));


// Define the Message Schema and Model
const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
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

// 💥 Global state for exclusive lock and last seen
const activeUsers = {}; // { 'x': <socket_id>, 'i': <socket_id> }
const lastSeenTime = {}; // { 'x': <timestamp>, 'i': <timestamp> }
const ALL_USERS = ['x', 'i'];

// 💥 Helper to broadcast the combined online status
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


// Tell Express to serve static files (like index.html, styles.css, client.js)
app.use(express.static(__dirname));

// Route to serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// --- SOCKET.IO REAL-TIME LOGIC ---
io.on('connection', async (socket) => {
  console.log('A user connected');

  // Send initial status updates
  socket.emit('user-lock-status', activeUsers);
  broadcastOnlineStatus();

  // Load History on connection
  try {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(100);
    socket.emit('history', messages); 
  } catch (error) {
    console.error("Error loading chat history:", error);
  }

  // Handler for client requesting a user ID (exclusive lock)
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

    console.log(`User ${userId} claimed by socket ${socket.id}.`);
  });


  // Listen for 'chat message' event from any client
  socket.on('chat message', async (msgData) => {
    if (!socket.data.userId || socket.data.userId !== msgData.sender) {
        console.warn(`Message blocked: Sender ${msgData.sender} is not authorized or assigned.`);
        return;
    }
    
    console.log(`Message from ${msgData.sender}: ${msgData.text}`);
    
    try {
       const newMessage = new Message(msgData);
       const savedMessage = await newMessage.save();
       io.emit('chat message', savedMessage); 
    } catch (e) { 
        console.error("Error saving message:", e); 
    }
  });
  
  // 💥 NEW: Handler for deleting a message
  socket.on('delete message', async (data) => {
    const { messageId, senderId } = data;
    
    // Authorization Check: Only allow deletion if the sender is 'x' and they are the one currently logged in as 'x'
    if (senderId !== 'x' || socket.data.userId !== 'x') {
        console.warn(`Deletion attempt blocked: User ${senderId} not authorized or not logged in as 'x'.`);
        return;
    }

    try {
        // Delete message by its MongoDB _id
        const result = await Message.deleteOne({ _id: messageId });
        
        if (result.deletedCount > 0) {
            console.log(`Message ${messageId} deleted by user 'x'.`);
            // Broadcast the deletion to all clients
            io.emit('message deleted', { messageId: messageId });
        } else {
            console.warn(`Attempted to delete non-existent message: ${messageId}`);
        }
    } catch (error) {
        console.error("Error deleting message:", error);
    }
  });


  // Handle disconnect
  socket.on('disconnect', () => {
    const userId = socket.data.userId; 
    if (userId && activeUsers[userId] === socket.id) {
        delete activeUsers[userId];
        lastSeenTime[userId] = Date.now();
        
        io.emit('user-lock-status', activeUsers);
        broadcastOnlineStatus();
        console.log(`User ${userId} released on disconnect.`);
    }
    console.log('User disconnected');
  });
});
// ---------------------------------


// --- Server Start Logic ---

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; 

server.listen(PORT, HOST, () => { 
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Live app URL: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}`);
});