// delete-test-messages.js - Script to delete test messages from MongoDB

const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://davidsonsolomon26:Davien11@ebab.4fbr6fo.mongodb.net/?appName=ebab";
const dbName = "chatAppDB";
const collectionName = "messages";

async function deleteTestMessages() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Find test messages (messages containing "test" in their content)
        const testMessages = await collection.find({ 
            message: { $regex: /test/i } 
        }).toArray();

        console.log(`Found ${testMessages.length} test messages`);

        if (testMessages.length === 0) {
            console.log("No test messages to delete.");
            return;
        }

        // Show sample of messages to be deleted
        console.log("\nSample messages to be deleted:");
        testMessages.slice(0, 5).forEach(msg => {
            console.log(`- ${msg.message.substring(0, 50)}... (${msg.timestamp})`);
        });

        // Confirm before deletion
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise(resolve => {
            rl.question(`\nAre you sure you want to delete these ${testMessages.length} test messages? (yes/no): `, resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'yes') {
            console.log("Deletion cancelled.");
            return;
        }

        // Delete test messages
        const result = await collection.deleteMany({ 
            message: { $regex: /test/i } 
        });
        console.log(`\nDeleted ${result.deletedCount} test messages`);

        // Verify deletion
        const remainingTestMessages = await collection.countDocuments({ 
            message: { $regex: /test/i } 
        });
        console.log(`Remaining test messages: ${remainingTestMessages}`);

        const totalMessages = await collection.countDocuments();
        console.log(`Total messages remaining: ${totalMessages}`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
        console.log("\nConnection closed");
    }
}

deleteTestMessages();
