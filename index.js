const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

// --- DATABASE INTEGRATION PLACEHOLDER (Next Step) ---
/* // 1. Install Mongoose: npm install mongoose
// 2. Add connection code: 
const mongoose = require('mongoose');
const uri = "mongodb+srv://<USERNAME>:<PASSWORD>@clustername.xxxxx.mongodb.net/chat_db?retryWrites=true&w=majority"; 
mongoose.connect(uri).then(() => console.log('Connected to MongoDB Atlas!'));

// 3. Define the Message Schema/Model (for saving history): 
const Message = mongoose.model('Message', new mongoose.Schema({
    sender: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
}));
*/
// ---------------------------------------------------

// Tell Express to serve static files (like index.html, styles.css, client.js)
app.use(express.static(__dirname));

// Route to serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- SOCKET.IO REAL-TIME LOGIC ---
io.on('connection', (socket) => {
  console.log('A user connected');

  // Listen for 'chat message' event from any client
  socket.on('chat message', async (msgData) => {
    console.log(`Message from ${msgData.sender}: ${msgData.text}`);
    
    // 4. (Optional) Save the message to the database here:
    // try {
    //    const newMessage = new Message(msgData);
    //    await newMessage.save();
    // } catch (e) { console.error("Error saving message:", e); }

    // Broadcast the message to ALL connected clients
    io.emit('chat message', msgData);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});
// ---------------------------------

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});