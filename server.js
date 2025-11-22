// server.js - Sets up Express, Socket.IO, and MongoDB for message persistence.

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
// CRITICAL FIX: Use an Environment Variable for the URI.
// You MUST set the MONGO_URI variable in your Render dashboard settings.
const uri = process.env.MONGO_URI;

if (!uri) {
    console.error("CRITICAL ERROR: MONGO_URI environment variable is not set.");
    console.error("Please add MONGO_URI to your Render service Environment tab.");
    process.exit(1); 
}

const dbName = "chatAppDB"; 
const collectionName = "messages";

let messagesCollection; 

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
        // IMPROVED LOGGING: This should now show the exact connection error on Render
        console.error("--- MONGODB CONNECTION FAILED ---");
        console.error("Could not connect to MongoDB. Error details:", e.message);
        console.error("Exiting application due to database failure.");
        console.error("---------------------------------");
        process.exit(1); 
    }
}

// --- Server and Socket.IO Logic ---
function startServerLogic() {
    app.use(express.static(path.join(__dirname)));

    io.on('connection', async (socket) => {
        console.log('A user connected:', socket.id);

        try {
            const messagesHistory = await messagesCollection.find({}).toArray();
            socket.emit('history', messagesHistory);
        } catch (e) {
            console.error('Error fetching history:', e);
        }

        socket.on('select user', (userId) => {
            // ... (User selection logic from previous step) ...
        });

        socket.on('chat message', async (msg) => {
            try {
                await messagesCollection.insertOne(msg);
                console.log("Message saved to DB.");
            } catch (e) {
                console.error('Error saving message:', e);
            }
            
            io.emit('chat message', msg); 
        });

        socket.on('disconnect', () => {
            // ... (User disconnection logic from previous step) ...
        });
    });

    server.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}

connectDB();