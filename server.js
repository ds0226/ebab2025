// server.js - Sets up Express, Socket.IO, and MongoDB for message persistence.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
// CRITICAL FIX: Combined import to include ServerApiVersion
const { MongoClient, ServerApiVersion } = require('mongodb'); 

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

const io = new Server(server); 

// --- MongoDB Configuration ---
const uri = "mongodb+srv://david26:davien1130@ebab.w90ig5m.mongodb.net/?appName=EBAB";
const dbName = "chatAppDB"; 
const collectionName = "messages";

let messagesCollection; // Global variable to hold the collection reference

// --- MongoDB Connection Logic ---
async function connectDB() {
    // FIX: Using the MongoClient constructor with the specific options you defined
    const client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    });

    try {
        await client.connect();
        
        // FIX: The ping command you used is good for checking connectivity
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
        
        const db = client.db(dbName);
        messagesCollection = db.collection(collectionName);
        
        // Start listening after successful database connection
        startServerLogic(); 

    } catch (e) {
        console.error("Could not connect to MongoDB:", e);
        // If the database connection fails, the server should not proceed.
        process.exit(1); 
    }
}

// --- Server and Socket.IO Logic ---
function startServerLogic() {
    // Serve static files (HTML, CSS, JS)
    app.use(express.static(path.join(__dirname)));

    io.on('connection', async (socket) => {
        console.log('A user connected:', socket.id);

        // 1. Load History: Retrieve all messages from the database
        try {
            // Sort messages by _id which acts as an approximate creation timestamp
            const messagesHistory = await messagesCollection.find({}).toArray();
            socket.emit('history', messagesHistory);
        } catch (e) {
            console.error('Error fetching history:', e);
        }

        socket.on('chat message', async (msg) => {
            // 2. Save Message: Insert the new message into the database
            try {
                // MongoDB adds the _id field automatically
                await messagesCollection.insertOne(msg);
                console.log("Message saved to DB.");
            } catch (e) {
                console.error('Error saving message:', e);
            }
            
            // 3. Broadcast: Send the message to all connected clients
            io.emit('chat message', msg); 
        });

        socket.on('disconnect', () => {
            console.log('A user disconnected:', socket.id);
        });
    });

    server.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}

// Initiate the database connection and start the server logic
connectDB();