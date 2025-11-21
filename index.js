const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const path = require('path');


// --- MongoDB and Mongoose Integration ---
const mongoose = require('mongoose');

// Use environment variable MONGO_URI for deployment security, fallback to hardcoded for local testing.
// NOTE: I'm leaving your connection string as the hardcoded fallback for local testing, 
// but you should use the environment variable on Render for security.
const uri = process.env.MONGO_URI || "mongodb+srv://david26:davien11@ebab.w90ig5m.mongodb.net/two_person_chat_db?appName=EBAB";


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
       const newMessage = new Message(msgData);
       const savedMessage = await newMessage.save();
       // Broadcast the saved message (which now has a timestamp from MongoDB)
       io.emit('chat message', savedMessage); 
    } catch (e) { 
        console.error("Error saving message:", e); 
    }
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