// memory_stress_test.js - Simulates heavy usage to test memory leaks

const io = require('socket.io-client');

class MemoryStressTest {
    constructor(serverUrl = 'http://localhost:3000', numClients = 10) {
        this.serverUrl = serverUrl;
        this.numClients = numClients;
        this.clients = [];
        this.testDuration = 300000; // 5 minutes
        this.messageInterval = 1000; // 1 message per second per client
        this.running = false;
    }

    async start() {
        console.log(`🚀 Starting memory stress test: ${this.numClients} clients for ${this.testDuration/1000}s`);
        this.running = true;

        // Create multiple client connections
        for (let i = 0; i < this.numClients; i++) {
            await this.createClient(i);
        }

        // Start sending messages
        this.startMessageSimulation();

        // End test after duration
        setTimeout(() => {
            this.endTest();
        }, this.testDuration);
    }

    async createClient(clientIndex) {
        return new Promise((resolve) => {
            const client = io(this.serverUrl);
            
            client.on('connect', () => {
                console.log(`📱 Client ${clientIndex} connected: ${client.id}`);
                
                // Simulate user selection
                const userId = clientIndex % 2 === 0 ? 'i' : 'x';
                client.emit('select user', userId);
                
                this.clients.push({
                    index: clientIndex,
                    socket: client,
                    userId: userId
                });
                
                resolve();
            });

            client.on('disconnect', () => {
                console.log(`📱 Client ${clientIndex} disconnected`);
            });

            client.on('connect_error', (err) => {
                console.error(`❌ Client ${clientIndex} connection error:`, err.message);
                resolve(); // Continue even if connection fails
            });
        });
    }

    startMessageSimulation() {
        let messageCount = 0;
        
        const messageInterval = setInterval(() => {
            if (!this.running) {
                clearInterval(messageInterval);
                return;
            }

            // Each client sends a message
            this.clients.forEach((client) => {
                if (client.socket.connected) {
                    const message = {
                        senderID: client.userId,
                        receiverID: client.userId === 'i' ? 'x' : 'i',
                        text: `Stress test message #${messageCount} from client ${client.index}`,
                        timestamp: new Date().toISOString()
                    };
                    
                    client.socket.emit('chat message', message);
                }
            });

            messageCount++;
            
            // Log progress every 30 seconds
            if (messageCount % 30 === 0) {
                console.log(`📊 Sent ${messageCount * this.clients.length} total messages`);
            }
        }, this.messageInterval);
    }

    endTest() {
        console.log('🏁 Ending stress test...');
        this.running = false;

        // Disconnect all clients
        this.clients.forEach((client, index) => {
            setTimeout(() => {
                if (client.socket.connected) {
                    client.socket.disconnect();
                }
            }, index * 100); // Stagger disconnections
        });

        setTimeout(() => {
            console.log('✅ All clients disconnected');
            console.log('📊 Check the server logs for memory usage patterns');
            process.exit(0);
        }, 5000);
    }
}

// --- Main execution ---
if (require.main === module) {
    const args = process.argv.slice(2);
    const numClients = parseInt(args[0]) || 5;
    const testDuration = parseInt(args[1]) || 300000; // 5 minutes default
    
    const test = new MemoryStressTest('http://localhost:3000', numClients);
    test.testDuration = testDuration;
    
    test.start().catch(console.error);
}

module.exports = MemoryStressTest;