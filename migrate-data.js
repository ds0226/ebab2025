// migrate-data.js - Transfer old messages to new MongoDB cluster

const { MongoClient, ServerApiVersion } = require('mongodb');

// Connection strings
const oldUri = "mongodb+srv://davidsonsolomon26:Davien11@ebab.w90ig5m.mongodb.net/?appName=EBAB";
const newUri = "mongodb+srv://davidsonsolomon26:Davien11@ebab.4fbr6fo.mongodb.net/?appName=ebab";

// Alternative connection strings to try
const fallbackUris = [
    "mongodb://davidsonsolomon26:Davien11@ac-xb7kikh-shard-00-00.w90ig5m.mongodb.net:27017,ac-xb7kikh-shard-00-01.w90ig5m.mongodb.net:27017,ac-xb7kikh-shard-00-02.w90ig5m.mongodb.net:27017/chatAppDB?replicaSet=atlas-6swcsn-shard-0",
    "mongodb+srv://davidsonsolomon26:Davien11@ebab.w90ig5m.mongodb.net/chatAppDB?retryWrites=true&w=majority",
    "mongodb://159.41.64.149:27017/chatAppDB"
];

const dbName = "chatAppDB";
const collectionName = "messages";

async function migrateData() {
    console.log('🔄 Starting data migration...');
    
    let oldClient = null;
    let oldCollection = null;
    let oldMessages = [];
    
    // Try multiple connection methods for old database
    console.log('🔗 Attempting to connect to old database...');
    
    for (let attempt = 0; attempt < fallbackUris.length + 1; attempt++) {
        try {
            const uri = attempt === 0 ? oldUri : fallbackUris[attempt - 1];
            console.log(`🔗 Attempt ${attempt + 1}: Using ${uri.substring(0, 50)}...`);
            
            oldClient = new MongoClient(uri, {
                serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
                connectTimeoutMS: 15000, // Shorter timeout for fallback attempts
                socketTimeoutMS: 15000
            });
            
            await oldClient.connect();
            const oldDb = oldClient.db(dbName);
            oldCollection = oldDb.collection(collectionName);
            
            // Get all messages from old database
            console.log('� Fetching messages from old database...');
            oldMessages = await oldCollection.find({}).toArray();
            console.log(`📊 Found ${oldMessages.length} messages in old database`);
            
            console.log('✅ Successfully connected to old database!');
            break; // Success, exit loop
            
        } catch (error) {
            console.error(`❌ Attempt ${attempt + 1} failed:`, error.message || error);
            if (oldClient) {
                try { await oldClient.close(); } catch (e) { /* ignore */ }
            }
            
            if (attempt === fallbackUris.length) {
                console.log('� All connection attempts failed');
                throw new Error('Unable to connect to old database with any method');
            }
        }
    }
    
    if (oldMessages.length === 0) {
        console.log('⚠️ No messages found in old database');
        return;
    }
    
    // Connect to new database
    const newClient = new MongoClient(newUri, {
        serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
        connectTimeoutMS: 30000,
        socketTimeoutMS: 30000
    });

    try {
        console.log('🔗 Connecting to new database...');
        await newClient.connect();
        const newDb = newClient.db(dbName);
        const newCollection = newDb.collection(collectionName);
        
        // Insert messages into new database
        console.log('💾 Transferring messages to new database...');
        
        let transferred = 0;
        for (const message of oldMessages) {
            try {
                await newCollection.insertOne(message);
                transferred++;
                
                if (transferred % 10 === 0) {
                    console.log(`📤 Transferred ${transferred}/${oldMessages.length} messages...`);
                }
            } catch (error) {
                console.error('❌ Failed to transfer message:', message._id, error.message);
            }
        }
        
        console.log(`✅ Migration complete! Transferred ${transferred}/${oldMessages.length} messages`);
        
        // Verify transfer
        const newCount = await newCollection.countDocuments();
        console.log(`📊 New database now has ${newCount} messages`);
        
        // Close connections
        await oldClient.close();
        await newClient.close();
        console.log('🔌 Connections closed');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        
        // Close connections on error
        try {
            await oldClient.close();
            await newClient.close();
        } catch (closeError) {
            console.error('❌ Failed to close connections:', closeError);
        }
    }
}

// Run migration
migrateData().then(() => {
    console.log('🎉 Migration script finished');
    process.exit(0);
}).catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
});
