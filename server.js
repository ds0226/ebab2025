// ... (Existing imports and MongoDB connection setup) ...

// --- Global Chat State ---
// Track which user IDs are currently taken
let inUseUsers = {}; // e.g., { socketId1: 'i', socketId2: 'x' } 


// ... (Existing startServerLogic function) ...

function startServerLogic() {
    // ... (Existing app.use(express.static...)) ...

    io.on('connection', async (socket) => {
        console.log('A user connected:', socket.id);

        // 1. Initial State Broadcast: Send the current state of in-use users
        // This is done BEFORE sending history so the client can disable buttons first.
        socket.emit('available users', Object.values(inUseUsers)); 

        // 2. Load History: Retrieve all messages from the database
        // ... (Existing MongoDB history loading logic) ...
        try {
            const messagesHistory = await messagesCollection.find({}).toArray();
            socket.emit('history', messagesHistory);
        } catch (e) {
            console.error('Error fetching history:', e);
        }

        // --- NEW: User Selection Event ---
        socket.on('select user', (userId) => {
            // Check if the user ID is already in use by another socket
            if (!Object.values(inUseUsers).includes(userId)) {
                
                // 2a. Reserve the ID: Add the new user ID and map it to this socket's ID
                inUseUsers[socket.id] = userId;
                
                // 2b. Acknowledge and Broadcast: Tell the client it was successful 
                // and broadcast the new list to ALL clients so they can update buttons.
                socket.emit('user selected', true);
                io.emit('available users', Object.values(inUseUsers));
                console.log(`User ${userId} selected by ${socket.id}. Current users: ${Object.values(inUseUsers)}`);
            } else {
                // ID is already taken
                socket.emit('user selected', false);
            }
        });
        
        // ... (Existing 'chat message' logic) ...
        socket.on('chat message', async (msg) => {
            // ... (MongoDB save and io.emit('chat message', msg) logic) ...
        });

        // --- NEW: Disconnect/Deselection Event ---
        socket.on('disconnect', () => {
            const userId = inUseUsers[socket.id];
            
            // Release the user ID
            if (userId) {
                delete inUseUsers[socket.id];
                console.log(`User ${userId} disconnected. Released ID.`);
                
                // Broadcast the updated list to ALL clients
                io.emit('available users', Object.values(inUseUsers));
            }
            console.log('A user disconnected:', socket.id);
        });
    });

    // ... (Existing server.listen logic) ...
}

// ... (Existing connectDB() and connectDB() call) ...