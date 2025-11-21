const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const path = require('path');


// --- MongoDB and Mongoose Integration ---
const mongoose = require('mongoose');

// Using environment variable MONGO_URI
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
    timestamp: { type: Date, default: Date.now },
    // 💥 NEW: Add message status
    status: { 
        type: String, 
        enum: ['sent', 'delivered', 'read'],
        default: 'sent' 
    }
});

const Message = mongoose.model('Message', MessageSchema);
// ----------------------------------------

// --- Socket.IO and CORS Configuration ---

// Use environment variable RENDER_EXTERNAL_URL for CORS to allow the client connection
const externalUrl = process.env.RENDER_EXTERNAL_URL; 

const io = new Server(server, {
    cors: {
        origin: externalUrl || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});
// ----------------------------------------


// Tell Express to serve static files (like index.html, styles.css, client.js)
app.use(express.static(__dirname));

// Route to serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 💥 NEW: Helper function to update status and broadcast
const updateMessageStatus = async (messageId, newStatus) => {
    try {
        const updatedMessage = await Message.findByIdAndUpdate(
            messageId,
            { status: newStatus },
            { new: true } // Return the updated document
        );
        if (updatedMessage) {
            // Broadcast the change to ALL clients
            io.emit('message status update', updatedMessage);
            console.log(`Message ${messageId} updated to status: ${newStatus}`);
        }
    } catch (error) {
        console.error(`Error updating message status to ${newStatus}:`, error);
    }
};


// --- SOCKET.IO REAL-TIME LOGIC ---
io.on('connection', async (socket) => {
  console.log('A user connected');

  // Load History on connection
  try {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(100);
    socket.emit('history', messages); 
  } catch (error) {
    console.error("Error loading chat history:", error);
  }

  // Listen for 'chat message' event from any client
  socket.on('chat message', async (msgData) => {
    console.log(`Message from ${msgData.sender}: ${msgData.text}`);
    
    // Save the new message to the database
    try {
       // 💥 MODIFIED: Set initial status to 'sent'
       const newMessage = new Message({ ...msgData, status: 'sent' }); 
       const savedMessage = await newMessage.save();
       // Broadcast the saved message (which now has a timestamp and _id from MongoDB)
       io.emit('chat message', savedMessage); 
    } catch (e) { 
        console.error("Error saving message:", e); 
    }
  });
  
  // 💥 NEW: Listen for delivery confirmation from a client
  socket.on('message delivered', (data) => {
      // The receiving client has displayed the message.
      updateMessageStatus(data.messageId, 'delivered');
  });

  // 💥 NEW: Listen for read confirmation from a client
  socket.on('message read', (data) => {
      // The receiving client has likely brought the chat window into focus.
      updateMessageStatus(data.messageId, 'read');
  });


  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});
// ---------------------------------


// --- Server Start Logic ---

// Use the environment variable PORT provided by Render, or fall back to 3000 locally
const PORT = process.env.PORT || 3000;
// Set the host to 0.0.0.0 for compatibility with Render's network configuration
const HOST = '0.0.0.0'; 

server.listen(PORT, HOST, () => { 
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Live app URL: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}`);
});