const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const path = require('path');


// --- MongoDB and Mongoose Integration ---
const mongoose = require('mongoose');

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const path = require('path');


// --- MongoDB and Mongoose Integration ---
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI || "mongodb+srv://david26:davien11@ebab.w90ig5m.mongodb.net/two_person_chat_db?appName=EBAB";


mongoose.connect(uri)
  .then(() => console.log('Successfully connected to MongoDB Atlas!'))
  .catch(err => console.error('MongoDB connection error:', err));


// Define the Message Schema and Model
const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    // 💥 RESTORED: Add message status
    status: { 
        type: String, 
        enum: ['sent', 'delivered', 'read'],
        default: 'sent' // Default state when first saved
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

// 💥 NEW/RESTORED: Helper function to update status and broadcast
const updateMessageStatus = async (messageId, newStatus) => {
    try {
        // Only update if the new status is 'higher' than the current status (e.g., delivered -> read)
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


app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// --- SOCKET.IO REAL-TIME LOGIC ---
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

    console.log(`User ${userId} claimed by socket ${socket.id}.`);
  });


  socket.on('chat message', async (msgData) => {
    if (!socket.data.userId || socket.data.userId !== msgData.sender) {
        console.warn(`Message blocked: Sender ${msgData.sender} is not authorized or assigned.`);
        return;
    }
    
    try {
       // 💥 MODIFIED: Set initial status to 'sent'
       const newMessage = new Message({ ...msgData, status: 'sent' }); 
       const savedMessage = await newMessage.save();
       io.emit('chat message', savedMessage); 
    } catch (e) { 
        console.error("Error saving message:", e); 
    }
  });

  // 💥 RESTORED: Listen for delivery confirmation
  socket.on('message delivered', (data) => {
      // The receiving client has displayed the message.
      updateMessageStatus(data.messageId, 'delivered');
  });

  // 💥 RESTORED: Listen for read confirmation (e.g., when chat window is focused)
  socket.on('message read', (data) => {
      updateMessageStatus(data.messageId, 'read');
  });
  
  // Handler for deleting multiple messages
  socket.on('delete multiple messages', async (data) => {
    const { messageIds, senderId } = data;
    
    if (senderId !== 'x' || socket.data.userId !== 'x' || !Array.isArray(messageIds) || messageIds.length === 0) {
        console.warn(`Deletion attempt blocked: User ${senderId} not authorized or not logged in as 'x'.`);
        return;
    }

    try {
        const result = await Message.deleteMany({ _id: { $in: messageIds } });
        
        if (result.deletedCount > 0) {
            console.log(`${result.deletedCount} messages deleted by user 'x'.`);
            io.emit('message deleted', { messageIds: messageIds });
        } else {
            console.warn(`Attempted to delete non-existent messages.`);
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


mongoose.connect(uri)
  .then(() => console.log('Successfully connected to MongoDB Atlas!'))
  .catch(err => console.error('MongoDB connection error:', err));


// Define the Message Schema and Model
const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    // 💥 RESTORED: Add message status
    status: { 
        type: String, 
        enum: ['sent', 'delivered', 'read'],
        default: 'sent' // Default state when first saved
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

// 💥 NEW/RESTORED: Helper function to update status and broadcast
const updateMessageStatus = async (messageId, newStatus) => {
    try {
        // Only update if the new status is 'higher' than the current status (e.g., delivered -> read)
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


app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// --- SOCKET.IO REAL-TIME LOGIC ---
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

    console.log(`User ${userId} claimed by socket ${socket.id}.`);
  });


  socket.on('chat message', async (msgData) => {
    if (!socket.data.userId || socket.data.userId !== msgData.sender) {
        console.warn(`Message blocked: Sender ${msgData.sender} is not authorized or assigned.`);
        return;
    }
    
    try {
       // 💥 MODIFIED: Set initial status to 'sent'
       const newMessage = new Message({ ...msgData, status: 'sent' }); 
       const savedMessage = await newMessage.save();
       io.emit('chat message', savedMessage); 
    } catch (e) { 
        console.error("Error saving message:", e); 
    }
  });

  // 💥 RESTORED: Listen for delivery confirmation
  socket.on('message delivered', (data) => {
      // The receiving client has displayed the message.
      updateMessageStatus(data.messageId, 'delivered');
  });

  // 💥 RESTORED: Listen for read confirmation (e.g., when chat window is focused)
  socket.on('message read', (data) => {
      updateMessageStatus(data.messageId, 'read');
  });
  
  // Handler for deleting multiple messages
  socket.on('delete multiple messages', async (data) => {
    const { messageIds, senderId } = data;
    
    if (senderId !== 'x' || socket.data.userId !== 'x' || !Array.isArray(messageIds) || messageIds.length === 0) {
        console.warn(`Deletion attempt blocked: User ${senderId} not authorized or not logged in as 'x'.`);
        return;
    }

    try {
        const result = await Message.deleteMany({ _id: { $in: messageIds } });
        
        if (result.deletedCount > 0) {
            console.log(`${result.deletedCount} messages deleted by user 'x'.`);
            io.emit('message deleted', { messageIds: messageIds });
        } else {
            console.warn(`Attempted to delete non-existent messages.`);
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