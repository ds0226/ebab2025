// server.js - Sets up Express, Socket.IO, and MongoDB for persistence and user exclusivity.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient, ServerApiVersion } = require('mongodb'); 

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

const io = new Server(server); 

// --- MongoDB Configuration ---
// The connection string MUST be set as the MONGO_URI environment variable (e.g., on Render).
const uri = process.env.MONGO_URI; 

if (!uri) {
    console.error("CRITICAL ERROR: MONGO_URI environment variable is not set.");
    process.exit(1); 
}

const dbName = "chatAppDB"; 
const collectionName = "messages";

let messagesCollection; 

// --- Global Chat State for User Exclusivity (CRITICAL) ---
// Tracks which user IDs ('i' or 'x') are currently taken, mapped to the socket ID.
const activeUsers = {
    'i': null, // Holds socket.id if user 'i' is active, null otherwise
    'x': null  // Holds socket.id if user 'x' is active, null otherwise
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
        
        // Start the server logic only after successful database connection
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
            
            if (activeUsers[userId] === null) {
                // SUCCESS: User ID is available
                activeUsers[userId] = socket.id;
                
                // Tell the client it was successful 
                socket.emit('user selected', true);
                console.log(`${userId} selected by ${socket.id}`);

            } else {
                // FAILURE: User ID is already taken
                socket.emit('user selected', false);
            }
            
            // Broadcast the updated list to ALL clients so they can update buttons.
            const inUseList = Object.keys(activeUsers).filter(key => activeUsers[key] !== null);
            io.emit('available users', inUseList);
        });
        
        // --- Chat Message Event ---
        socket.on('chat message', async (msg) => {
            try {
                // Save the complete message object to the database
                await messagesCollection.insertOne(msg);
                console.log("Message saved to DB.");
            } catch (e) {
                console.error('Error saving message:', e);
            }
            
            // Broadcast the message to all connected clients
            io.emit('chat message', msg); 
        });

        // --- Disconnect/Deselection Event ---
        socket.on('disconnect', () => {
            console.log('A user disconnected:', socket.id);
            
            // Check which user this socket was controlling
            const disconnectedUser = Object.keys(activeUsers).find(key => activeUsers[key] === socket.id);
            
            if (disconnectedUser) {
                activeUsers[disconnectedUser] = null; // Free up the user slot