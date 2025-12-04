// memory_monitor.js - Real-time memory monitoring for the chat server

const os = require('os');
const { performance } = require('perf_hooks');

class MemoryMonitor {
    constructor(intervalMs = 5000) {
        this.intervalMs = intervalMs;
        this.startTime = Date.now();
        this.monitoring = false;
        this.intervalId = null;
        this.memoryHistory = [];
        this.maxHistoryLength = 100; // Keep last 100 readings
    }

    start() {
        if (this.monitoring) {
            console.log('Memory monitoring already running');
            return;
        }

        console.log('🔍 Starting memory monitoring...');
        this.monitoring = true;
        this.intervalId = setInterval(() => {
            this.checkMemory();
        }, this.intervalMs);
    }

    stop() {
        if (!this.monitoring) {
            console.log('Memory monitoring not running');
            return;
        }

        console.log('⏹️ Stopping memory monitoring...');
        this.monitoring = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    checkMemory() {
        const memUsage = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        const memoryData = {
            timestamp: new Date().toISOString(),
            uptime: this.getUptime(),
            process: {
                rss: this.formatBytes(memUsage.rss),
                heapTotal: this.formatBytes(memUsage.heapTotal),
                heapUsed: this.formatBytes(memUsage.heapUsed),
                external: this.formatBytes(memUsage.external),
                arrayBuffers: this.formatBytes(memUsage.arrayBuffers),
                // Store raw bytes for calculations
                rssBytes: memUsage.rss,
                heapTotalBytes: memUsage.heapTotal,
                heapUsedBytes: memUsage.heapUsed,
                externalBytes: memUsage.external,
                arrayBuffersBytes: memUsage.arrayBuffers
            },
            system: {
                total: this.formatBytes(totalMem),
                free: this.formatBytes(freeMem),
                used: this.formatBytes(usedMem),
                usagePercent: ((usedMem / totalMem) * 100).toFixed(2) + '%',
                // Store raw bytes for calculations
                totalBytes: totalMem,
                freeBytes: freeMem,
                usedBytes: usedMem
            }
        };

        // Add to history
        this.memoryHistory.push(memoryData);
        if (this.memoryHistory.length > this.maxHistoryLength) {
            this.memoryHistory.shift();
        }

        // Log current memory status
        this.logMemoryStatus(memoryData);

        // Check for memory warnings
        this.checkMemoryWarnings(memoryData);
    }

    logMemoryStatus(data) {
        const heapUsagePercent = ((data.process.heapUsedBytes / data.process.heapTotalBytes) * 100).toFixed(1);
        console.log(`📊 Memory Status | Uptime: ${data.uptime} | Heap: ${heapUsagePercent}% (${data.process.heapUsed}/${data.process.heapTotal}) | RSS: ${data.process.rss}`);
    }

    checkMemoryWarnings(data) {
        const heapUsagePercent = (data.process.heapUsedBytes / data.process.heapTotalBytes) * 100;
        const systemUsagePercent = (data.system.usedBytes / data.system.totalBytes) * 100;

        // Process heap warnings
        if (heapUsagePercent > 90) {
            console.log('🚨 CRITICAL: Process heap usage > 90%!');
        } else if (heapUsagePercent > 80) {
            console.log('⚠️ WARNING: Process heap usage > 80%');
        } else if (heapUsagePercent > 70) {
            console.log('📈 INFO: Process heap usage > 70%');
        }

        // System memory warnings
        if (systemUsagePercent > 95) {
            console.log('🚨 CRITICAL: System memory usage > 95% - OOM risk!');
        } else if (systemUsagePercent > 85) {
            console.log('⚠️ WARNING: System memory usage > 85%');
        }
    }

    getUptime() {
        const uptime = Date.now() - this.startTime;
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getMemoryReport() {
        if (this.memoryHistory.length === 0) {
            return 'No memory data available';
        }

        const latest = this.memoryHistory[this.memoryHistory.length - 1];
        const oldest = this.memoryHistory[0];
        
        const heapGrowth = latest.process.heapUsedBytes - oldest.process.heapUsedBytes;
        const rssGrowth = latest.process.rssBytes - oldest.process.rssBytes;
        
        return {
            duration: this.getUptime(),
            samples: this.memoryHistory.length,
            current: latest,
            growth: {
                heap: this.formatBytes(heapGrowth),
                rss: this.formatBytes(rssGrowth),
                heapRate: this.formatBytes(heapGrowth / this.memoryHistory.length * 12) + '/min', // per minute (5s intervals)
                rssRate: this.formatBytes(rssGrowth / this.memoryHistory.length * 12) + '/min'
            }
        };
    }

    // Helper to convert formatBytes back to bytes for calculations
    formatBytesWithBytes(bytes) {
        if (bytes === 0) return { formatted: '0 Bytes', bytes: 0 };
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        
        // Return object with both formatted string and raw bytes
        return { formatted: formatted, bytes: bytes };
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Export for use in server
module.exports = MemoryMonitor;

// If run directly, start monitoring
if (require.main === module) {
    const monitor = new MemoryMonitor(5000); // Check every 5 seconds
    
    monitor.start();
    
    // Stop on Ctrl+C
    process.on('SIGINT', () => {
        console.log('\nGenerating final memory report...');
        const report = monitor.getMemoryReport();
        console.log('\n📋 Final Memory Report:');
        console.log(JSON.stringify(report, null, 2));
        monitor.stop();
        process.exit(0);
    });
}