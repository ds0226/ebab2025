// manual-import.js - Manual data import to new MongoDB cluster
// Use this if the old database is inaccessible

const { MongoClient, ServerApiVersion } = require('mongodb');

// Connection to new database
const newUri = "mongodb+srv://davidsonsolomon26:Davien11@ebab.4fbr6fo.mongodb.net/?appName=ebab";
const dbName = "chatAppDB";
const collectionName = "messages";

// Sample data structure - replace with your actual messages
const sampleMessages = [
    {
        senderID: "i",
        message: "Hello from User I",
        type: "text",
        status: "sent",
        timestamp: new Date("2026-03-30T10:00:00.000Z").toISOString()
    },
    {
        senderID: "x", 
        message: "Reply from User X",
        type: "text",
        status: "sent",
        timestamp: new Date("2026-03-30T10:05:00.000Z").toISOString()
    },
    {
        senderID: "i",
        message: "How are you?",
        type: "text", 
        status: "sent",
        timestamp: new Date("2026-03-30T10:10:00.000Z").toISOString()
    }
];

async function manualImport() {
    console.log('🔄 Starting manual data import...');
    
    const client = new MongoClient(newUri, {
        serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
        connectTimeoutMS: 30000,
        socketTimeoutMS: 30000
    });

    try {
        console.log('🔗 Connecting to new database...');
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        
        // Clear existing data (optional - remove if you want to keep existing data)
        console.log('🗑️ Clearing existing messages...');
        await collection.deleteMany({});
        console.log('✅ Cleared existing messages');
        
        // Insert sample messages
        console.log('💾 Inserting sample messages...');
        let inserted = 0;
        for (const message of sampleMessages) {
            try {
                await collection.insertOne(message);
                inserted++;
                console.log(`✅ Inserted message ${inserted}: ${message.message.substring(0, 30)}...`);
            } catch (error) {
                console.error('❌ Failed to insert message:', error.message);
            }
        }
        
        // Verify import
        const count = await collection.countDocuments();
        console.log(`📊 Import complete! Database now has ${count} messages`);
        
        await client.close();
        console.log('🔌 Connection closed');
        
    } catch (error) {
        console.error('❌ Manual import failed:', error);
        
        try {
            await client.close();
        } catch (closeError) {
            console.error('❌ Failed to close connection:', closeError);
        }
    }
}

// Run manual import
manualImport().then(() => {
    console.log('🎉 Manual import finished');
    process.exit(0);
}).catch((error) => {
    console.error('💥 Manual import failed:', error);
    process.exit(1);
});
