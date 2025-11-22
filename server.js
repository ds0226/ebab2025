// server.js - Sets up Express, Socket.IO, and MongoDB for message persistence.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient } = require('mongodb'); 

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

const io = new Server(server); 

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
const dbName = "chatAppDB"; 
const collectionName = "messages";

let messagesCollection; // Global variable to hold the collection reference

// --- MongoDB Connection Logic ---
async function connectDB() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        console.log("Successfully connected to MongoDB.");
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
            // Sort by time/creation date if possible, but for simplicity, we use the default order for now.
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