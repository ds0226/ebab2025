// server.js - Sets up the Express server and Socket.IO for real-time chat

const express = require('express');
const http = require('http'); // Required to create the HTTP server
const { Server } = require('socket.io'); // Import the Socket.IO server
const path = require('path');

const app = express();
const server = http.createServer(app); // Create HTTP server using the Express app
const port = process.env.PORT || 3000;

// Set up Socket.IO
const io = new Server(server); 

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// --- Socket.IO Connection Logic ---
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // 1. Listen for new chat messages from any client
  socket.on('chat message', (msg) => {
    // 2. Broadcast the received message to ALL connected clients, including the sender
    io.emit('chat message', msg); 
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

// Start the server (now using the http server instance)
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});