# User Presence & Online Duration System

## 🎯 Features Implemented

### ✅ Real-time Online/Offline Status
- Shows "Online" when the other user is actively connected
- Shows "X minutes ago" when the other user was last seen
- Updates automatically every 30 seconds

### ✅ Smart Duration Display
- **Just now** - Less than 1 minute ago
- **5 minutes ago** - 1-59 minutes ago  
- **2 hours ago** - 1-23 hours ago
- **3 days ago** - 24+ hours ago

### ✅ Enhanced User Selection
- Buttons show last seen time for offline users
- Real-time updates as users come online/go offline
- Visual indicators with color coding

## 📁 Files Modified

### server.js
```javascript
// Added presence tracking object
const userPresence = {
    'i': { isOnline: false, lastSeen: null, socketId: null },
    'x': { isOnline: false, lastSeen: null, socketId: null }
};

// Added time calculation helper
function getTimeAgo(timestamp) {
    // Calculates and formats "5 minutes ago" style strings
}

// Added presence broadcasting
function broadcastPresenceUpdate() {
    // Sends real-time updates to all connected clients
}

// Enhanced user selection to track presence
socket.on('select user', (userId) => {
    // Updates online status when user selects identity
});

// Enhanced disconnect to track offline status  
socket.on('disconnect', () => {
    // Updates offline status with timestamp
});

// Added periodic updates (every 30 seconds)
setInterval(broadcastPresenceUpdate, 30000);
```

### client.js
```javascript
// Added presence update handler
socket.on('presence update', (presenceData) => {
    // Updates chat header status
    // Updates user selection buttons
    // Shows "Online" or "5 minutes ago"
});

// Enhanced user selection to request presence
socket.on('user selected', (success) => {
    // Requests latest presence data when joining
});
```

### styles.css
```css
/* Enhanced status styling */
.status-online { color: #00a884; font-weight: bold; }
.status-offline { color: #8696a0; }
```

## 🚀 How It Works

### 1. User Comes Online
1. User selects "i" or "x" identity
2. Server updates `userPresence[userId].isOnline = true`
3. Server broadcasts presence update to all clients
4. Other user sees "Online" status

### 2. User Goes Offline
1. User disconnects (closes tab, loses connection)
2. Server updates `userPresence[userId].isOnline = false`
3. Server sets `userPresence[userId].lastSeen = new Date()`
4. Server broadcasts presence update
5. Other user sees "just now" → "1 minute ago" → "5 minutes ago"

### 3. Automatic Updates
- Every 30 seconds, server recalculates all "time ago" strings
- Clients receive updated presence data
- Status display updates automatically

## 🧪 Testing

### Interactive Test
Visit: `https://your-server/test_presence.html`

### Test Scenarios
1. **User "i" selects identity** → User "x" sees "i is Online"
2. **User "i" closes tab** → User "x" sees "i was just now ago"
3. **Wait 2 minutes** → User "x" sees "i was 2 minutes ago"
4. **User "i" reconnects** → User "x" sees "i is Online" again

## 📱 Visual Examples

### When Online
```
┌─────────────────────────────────────┐
│ i                │ x is Online     │ ← Green text
└─────────────────────────────────────┘
```

### When Offline  
```
┌─────────────────────────────────────┐
│ i                │ x was 5 minutes ago │ ← Gray text
└─────────────────────────────────────┘
```

### User Selection Buttons
```
┌─────────────────────────┐
│    Chat as: i           │ ← Normal button
│    Chat as: x (2 minutes ago) │ ← Shows last seen
└─────────────────────────┘
```

## 🔧 Technical Details

### Server-Side State
```javascript
userPresence = {
    'i': {
        isOnline: true,
        lastSeen: "2024-01-15T10:30:00.000Z",
        socketId: "abc123"
    },
    'x': {
        isOnline: false, 
        lastSeen: "2024-01-15T10:25:00.000Z",
        socketId: null
    }
}
```

### Client-Side Events
- `presence update` - Real-time status changes
- `available users` - User availability for selection
- `get presence update` - Manual request for current status

### Performance Considerations
- Presence data is lightweight (few bytes per update)
- Updates every 30 seconds to balance freshness and efficiency
- Only broadcasts when status actually changes
- Uses ISO timestamps for accurate time calculations

## 🎨 Styling Tips

The presence system uses existing CSS classes:
- `.status-online` - Green color for online users
- `.status-offline` - Gray color for offline users  
- You can customize these in `styles.css` for different themes

## 🔄 Backward Compatibility

The presence system is fully backward compatible:
- Existing messages continue to work
- No database schema changes required
- Gracefully handles older clients that don't support presence