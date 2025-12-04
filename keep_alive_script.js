// keep_alive_script.js - Pings your service every 10 minutes to prevent sleep

const https = require('https');
const http = require('http');

class KeepAliveService {
    constructor(serviceUrl, intervalMinutes = 10) {
        this.serviceUrl = serviceUrl;
        this.intervalMinutes = intervalMinutes;
        this.intervalMs = intervalMinutes * 60 * 1000;
        this.isRunning = false;
        this.intervalId = null;
    }

    start() {
        if (this.isRunning) {
            console.log('Keep alive service already running');
            return;
        }

        console.log(`🔄 Starting keep alive service for: ${this.serviceUrl}`);
        console.log(`⏰ Pinging every ${this.intervalMinutes} minutes`);
        
        this.isRunning = true;
        this.pingService(); // Ping immediately
        this.intervalId = setInterval(() => {
            this.pingService();
        }, this.intervalMs);
    }

    stop() {
        if (!this.isRunning) {
            console.log('Keep alive service not running');
            return;
        }

        console.log('⏹️ Stopping keep alive service');
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    pingService() {
        const startTime = Date.now();
        
        const protocol = this.serviceUrl.startsWith('https') ? https : http;
        
        const req = protocol.get(this.serviceUrl, (res) => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            console.log(`✅ Ping successful: ${res.statusCode} (${responseTime}ms) - ${new Date().toLocaleTimeString()}`);
        });

        req.on('error', (err) => {
            console.error(`❌ Ping failed: ${err.message} - ${new Date().toLocaleTimeString()}`);
        });

        req.setTimeout(30000, () => {
            req.destroy();
            console.error(`❌ Ping timeout after 30s - ${new Date().toLocaleTimeString()}`);
        });
    }
}

// Usage
if (require.main === module) {
    const serviceUrl = process.argv[2] || 'https://your-app.onrender.com';
    const intervalMinutes = parseInt(process.argv[3]) || 10;
    
    const keepAlive = new KeepAliveService(serviceUrl, intervalMinutes);
    
    keepAlive.start();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🔄 Shutting down keep alive service...');
        keepAlive.stop();
        process.exit(0);
    });
}

module.exports = KeepAliveService;