// client.js - Handles all client-side logic, including file upload and real-time read receipts.

const socket = io(); // Auto-connect to current host
let currentUser = null;
let pendingHistory = null;

// --- DOM Elements ---
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const selectionScreen = document.getElementById('initial-user-selection');
const chatContainer = document.getElementById('chat-container');
const currentUserDisplay = document.getElementById('my-user-id-display');
const otherUserStatus = document.getElementById('other-user-status');
const otherUserName = document.getElementById('other-user-name');
const photoInput = document.getElementById('photo-input');
const photoButton = document.getElementById('photo-button');


// --- Utility Functions ---

function getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

// --- Read Receipt Trigger (NEW) ---
function triggerReadReceipt(messageData) {
    // Only send a read receipt if:
    // 1. The message was NOT sent by the current user.
    // 2. The message has an ID (meaning it was loaded from history or saved by server).
    if (messageData.senderID !== currentUser && messageData._id) {
        socket.emit('message read', { 
            readerID: currentUser,
            messageID: messageData._id 
        });
    }
}

// --- File Upload Logic ---
photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        uploadFile(file);
    }
    e.target.value = null; 
});

async function uploadFile(file) {
    if (!currentUser) return alert('Please select a user first.');

    chatContainer.style.cursor = 'progress'; 

    const formData = new FormData();
    formData.append('mediaFile', file); 

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Upload failed with status: ' + response.status);
        const data = await response.json(); 

        const messageData = {
            senderID: currentUser,
            message: data.url,
            type: data.type,
            timestamp: new Date().toISOString()
        };
        socket.emit('chat message', messageData);

    } catch (error) {
        console.error('File upload failed:', error);
        alert('File upload failed. See console for details.');
    } finally {
        chatContainer.style.cursor = 'default';
    }
}


// --- Enhanced Message Rendering Logic with Actions ---

function createMessageElement(messageData) {
    const senderKey = messageData.senderID || messageData.sender;
    const isMyMessage = senderKey === currentUser;
    const status = messageData.status || 'sent'; // Default status to 'sent' if missing

    const li = document.createElement('li');
    li.className = `message-bubble ${isMyMessage ? 'my-message' : 'their-message'}`;
    // Use the MongoDB ID to target for status updates later
    if(messageData._id) {
        li.dataset.id = messageData._id; 
    }
    li.dataset.messageId = messageData._id || 'temp-' + Date.now();

    // --- Message Actions Container ---
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'message-actions';
    
    const actionsBtn = document.createElement('button');
    actionsBtn.className = 'message-actions-btn';
    actionsBtn.innerHTML = '⋮';
    actionsBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMessageActions(messageData._id || li.dataset.messageId);
    };
    
    actionsContainer.appendChild(actionsBtn);
    li.appendChild(actionsContainer);

    // --- Reply Container (if this is a reply) ---
    if (messageData.replyTo) {
        const replyContainer = document.createElement('div');
        replyContainer.className = 'reply-container';
        
        const replyText = document.createElement('div');
        replyText.className = 'reply-text';
        replyText.textContent = `Replying to ${messageData.replyTo.senderID}`;
        
        const replyMessage = document.createElement('div');
        replyMessage.className = 'reply-message';
        replyMessage.textContent = messageData.replyTo.message;
        
        replyContainer.appendChild(replyText);
        replyContainer.appendChild(replyMessage);
        li.appendChild(replyContainer);
    }

    // --- Forward Indicator (if this is a forwarded message) ---
    if (messageData.forwarded) {
        const forwardIndicator = document.createElement('div');
        forwardIndicator.className = 'forward-indicator';
        forwardIndicator.innerHTML = `<span class="forward-icon">⤴</span> Forwarded message`;
        li.appendChild(forwardIndicator);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // --- Media/Text Content Rendering ---
    if (messageData.type === 'image') {
        const img = document.createElement('img');
        img.src = messageData.message; 
        contentDiv.appendChild(img);
    } else if (messageData.type === 'video') {
        const video = document.createElement('video');
        video.src = messageData.message;
        video.controls = true;
        contentDiv.appendChild(video);
    } else if (messageData.type === 'document') {
        const docLink = document.createElement('a');
        docLink.href = messageData.message;
        docLink.target = '_blank';
        docLink.textContent = `\ud83d\udcc4 Download File (${messageData.message.split('/').pop()})`; 
        contentDiv.appendChild(docLink);
    } else {
        const textSpan = document.createElement('span');
        textSpan.className = 'message-text';
        textSpan.textContent = messageData.message;
        contentDiv.appendChild(textSpan);
    }

    li.appendChild(contentDiv); 

    // --- Reactions Container ---
    if (messageData.reactions && Object.keys(messageData.reactions).length > 0) {
        const reactionsContainer = document.createElement('div');
        reactionsContainer.className = 'message-reactions';
        
        for (const [emoji, users] of Object.entries(messageData.reactions)) {
            const reactionBtn = document.createElement('button');
            reactionBtn.className = 'reaction';
            reactionBtn.innerHTML = `${emoji}<span class="reaction-count">${users.length}</span>`;
            reactionBtn.onclick = () => toggleReaction(messageData._id, emoji);
            reactionsContainer.appendChild(reactionBtn);
        }
        
        li.appendChild(reactionsContainer);
    }

    // Time and Status Container
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    
    if (messageData.edited) {
        timeSpan.textContent = `edited ${getCurrentTime()}`;
    } else {
        timeSpan.textContent = getCurrentTime(); 
    }

    // --- Status Checkmarks ---
    if (isMyMessage) {
        const statusSpan = document.createElement('span');
        statusSpan.classList.add(`status-${status}`); 

        if (status === 'read') {
            statusSpan.innerHTML = '\u2713\u2713'; // Double checkmark
        } else {
            statusSpan.innerHTML = '\u2713';  // Single checkmark (Default for sent)
        }

        timeSpan.appendChild(statusSpan);
    }

    li.appendChild(timeSpan);

    return li;
}

function renderMessage(messageData) {
    messages.appendChild(createMessageElement(messageData));
    scrollToBottom();

    // CRITICAL: Trigger read receipt for incoming messages immediately after rendering
    triggerReadReceipt(messageData); 
}

// --- Socket.IO Event Listeners ---
socket.on('chat message', (msg) => {
    // Check if a list item with this ID already exists (prevents duplicates when sender receives own msg)
    if (!document.querySelector(`li[data-id="${msg._id}"]`)) {
        renderMessage(msg);
    }
});

socket.on('history', (messagesHistory) => {
    // Store history but don't render until user is selected
    pendingHistory = messagesHistory;
    console.log('History received but pending user selection:', messagesHistory.length, 'messages');
});

// --- Real-time Status Update Listener (NEW) ---
socket.on('message status update', (data) => {
    if (data.status === 'read') {
        const listItem = document.querySelector(`li[data-id="${data.messageID}"]`);

        if (listItem) {
            const statusSpan = listItem.querySelector('.message-time span');

            if (statusSpan && statusSpan.classList.contains('status-sent')) {
                statusSpan.classList.remove('status-sent');
                statusSpan.classList.add('status-read');
                statusSpan.innerHTML = '\u2713\u2713'; // Change single to double checkmark
            }
        }
    }
});

// --- Message Actions Event Listeners ---
socket.on('message edited', (data) => {
    console.log('Message edited:', data);
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        const textSpan = messageElement.querySelector('.message-text');
        if (textSpan) {
            textSpan.textContent = data.newMessage;
        }
        
        // Update time to show edited
        const timeSpan = messageElement.querySelector('.message-time');
        if (timeSpan) {
            const timeText = timeSpan.childNodes[0];
            timeText.textContent = `edited ${getCurrentTime()}`;
        }
    }
});

socket.on('message deleted', (data) => {
    console.log('Message deleted:', data);
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        messageElement.style.opacity = '0.5';
        messageElement.style.pointerEvents = 'none';
        
        const contentDiv = messageElement.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML = '<span style="color: #8696a0; font-style: italic;">This message was deleted</span>';
        }
        
        // Remove actions menu
        const actionsContainer = messageElement.querySelector('.message-actions');
        if (actionsContainer) {
            actionsContainer.remove();
        }
    }
});

socket.on('reaction added', (data) => {
    console.log('Reaction added:', data);
    updateMessageReactions(data.messageId, data.emoji, data.userId, 'add');
});

socket.on('reaction toggled', (data) => {
    console.log('Reaction toggled:', data);
    updateMessageReactions(data.messageId, data.emoji, data.userId, 'toggle');
});

function updateMessageReactions(messageId, emoji, userId, action) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    let reactionsContainer = messageElement.querySelector('.message-reactions');
    
    // Create reactions container if it doesn't exist
    if (!reactionsContainer) {
        reactionsContainer = document.createElement('div');
        reactionsContainer.className = 'message-reactions';
        
        // Insert before time span
        const timeSpan = messageElement.querySelector('.message-time');
        messageElement.insertBefore(reactionsContainer, timeSpan);
    }
    
    // Find existing reaction or create new one
    let existingReaction = Array.from(reactionsContainer.children).find(
        reaction => reaction.textContent.includes(emoji)
    );
    
    if (action === 'add') {
        if (!existingReaction) {
            const reactionBtn = document.createElement('button');
            reactionBtn.className = 'reaction';
            reactionBtn.innerHTML = `${emoji}<span class="reaction-count">1</span>`;
            reactionBtn.onclick = () => toggleReaction(messageId, emoji);
            reactionsContainer.appendChild(reactionBtn);
        } else {
            const countSpan = existingReaction.querySelector('.reaction-count');
            countSpan.textContent = parseInt(countSpan.textContent) + 1;
        }
    } else if (action === 'toggle') {
        if (existingReaction) {
            const countSpan = existingReaction.querySelector('.reaction-count');
            const currentCount = parseInt(countSpan.textContent);
            
            if (currentCount <= 1) {
                existingReaction.remove();
                if (reactionsContainer.children.length === 0) {
                    reactionsContainer.remove();
                }
            } else {
                countSpan.textContent = currentCount - 1;
            }
        }
    }
}


   



// --- Event Handlers ---

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value && currentUser) {
        const messageData = {
            senderID: currentUser, 
            message: input.value,
            type: 'text',
            status: 'sent', // Explicitly set status to sent
            timestamp: new Date().toISOString()
        };

        socket.emit('chat message', messageData);
        input.value = '';
    }
});

// --- User Selection Functionality ---
function setupUserSelection() {
    const userButtons = document.querySelectorAll('.user-buttons button');

    userButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedUser = button.getAttribute('data-user');
            selectUser(selectedUser);
        });
    });
}

function selectUser(userId) {
    currentUser = userId;

    // Tell the server which user we are
    socket.emit('select user', userId);
}

socket.on('user selected', (success) => {
    if (success) {
        selectionScreen.style.display = 'none';
        chatContainer.style.display = 'flex';
        currentUserDisplay.textContent = currentUser;
        
        // Set the other user's name
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        otherUserName.textContent = otherUser.toUpperCase();
        
        input.focus();

        // Render pending history now that we know who the current user is
        if (pendingHistory && pendingHistory.length > 0) {
            console.log('Rendering pending history for user:', currentUser);
            pendingHistory.forEach(renderMessage);
            pendingHistory = null; // Clear pending history
        }

        // Request latest presence data
        socket.emit('get presence update');
    } else {
        alert('This user is already taken. Please select the other user.');
    }
});

function updateOtherUserStatus() {
    // Logic to update the other user's status display
    socket.emit('get available users');
}

socket.on('available users', (inUseList) => {
    console.log('Available users:', inUseList);

    // Enable/disable buttons based on availability
    const userButtons = document.querySelectorAll('.user-buttons button');
    userButtons.forEach(button => {
        const userId = button.getAttribute('data-user');
        button.disabled = inUseList.includes(userId) && userId !== currentUser;
    });
});

// --- Enhanced Presence Update Handler ---
socket.on('presence update', (presenceData) => {
    console.log('Presence update received:', presenceData);

    if (currentUser) {
        const otherUser = currentUser === 'i' ? 'x' : 'i';
        const otherUserStatus = document.getElementById('other-user-status');
        const otherPresence = presenceData[otherUser];

        if (otherPresence) {
            if (otherPresence.isOnline) {
                otherUserStatus.textContent = 'Online';
                otherUserStatus.className = 'status-online';
            } else {
                // Show detailed time ago information
                const timeAgo = otherPresence.timeAgo || 'Offline';
                otherUserStatus.textContent = `last seen ${timeAgo}`;
                otherUserStatus.className = 'status-offline';
            }
        }
    }

    // Update user selection buttons status
    const userButtons = document.querySelectorAll('.user-buttons button');
    userButtons.forEach(button => {
        const userId = button.getAttribute('data-user');
        const userPresence = presenceData[userId];

        if (userPresence && !userPresence.isOnline && userPresence.timeAgo) {
            // Update button text to show last seen time
            if (userId !== currentUser) {
                const originalText = button.getAttribute('data-original-text') || button.textContent;
                if (!button.getAttribute('data-original-text')) {
                    button.setAttribute('data-original-text', originalText);
                }
                button.textContent = `${originalText} (${userPresence.timeAgo})`;
            }
        }
    });
});

// --- Message Actions Functionality ---

let activeMessageActions = null;
let replyToMessage = null;

function toggleMessageActions(messageId) {
    // Close any existing menu
    closeMessageActions();
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    // Create actions menu
    const menu = document.createElement('div');
    menu.className = 'message-actions-menu show';
    menu.id = 'message-actions-menu';
    
    const messageData = getMessageData(messageId);
    const isMyMessage = messageData.senderID === currentUser;
    
    // Reply
    const replyItem = createActionItem('↩️ Reply', () => {
        startReply(messageData);
        closeMessageActions();
    });
    menu.appendChild(replyItem);
    
    // Copy
    const copyItem = createActionItem('📋 Copy', () => {
        copyMessage(messageData);
        closeMessageActions();
    });
    menu.appendChild(copyItem);
    
    if (isMyMessage) {
        // Edit (only for own messages)
        if (messageData.type === 'text') {
            const editItem = createActionItem('✏️ Edit', () => {
                editMessage(messageData);
                closeMessageActions();
            });
            menu.appendChild(editItem);
        }
        
        // Delete (only for own messages)
        const deleteItem = createActionItem('🗑️ Delete', () => {
            deleteMessage(messageData);
            closeMessageActions();
        }, 'danger');
        menu.appendChild(deleteItem);
    }
    
    // Forward
    const forwardItem = createActionItem('⤴️ Forward', () => {
        forwardMessage(messageData);
        closeMessageActions();
    });
    menu.appendChild(forwardItem);
    
    // Download (for media files)
    if (messageData.type === 'image' || messageData.type === 'video' || messageData.type === 'document') {
        const downloadItem = createActionItem('💾 Download', () => {
            downloadFile(messageData);
            closeMessageActions();
        });
        menu.appendChild(downloadItem);
    }
    
    // Add reactions section
    const reactionsDivider = document.createElement('div');
    reactionsDivider.style.cssText = 'height: 1px; background: #384e5a; margin: 4px 0;';
    menu.appendChild(reactionsDivider);
    
    const reactionsLabel = document.createElement('div');
    reactionsLabel.style.cssText = 'padding: 5px 16px; color: #8696a0; font-size: 12px;';
    reactionsLabel.textContent = 'React';
    menu.appendChild(reactionsLabel);
    
    // Emoji reactions
    const emojis = ['❤️', '👍', '😂', '😮', '😢', '👎'];
    const reactionsContainer = document.createElement('div');
    reactionsContainer.style.cssText = 'display: flex; gap: 4px; padding: 8px 16px;';
    
    emojis.forEach(emoji => {
        const reactionBtn = document.createElement('button');
        reactionBtn.style.cssText = 'background: none; border: none; font-size: 20px; cursor: pointer; padding: 4px; border-radius: 4px;';
        reactionBtn.textContent = emoji;
        reactionBtn.onclick = () => {
            addReaction(messageData, emoji);
            closeMessageActions();
        };
        reactionsContainer.appendChild(reactionBtn);
    });
    
    menu.appendChild(reactionsContainer);
    
    // Position the menu using fixed positioning
    const actionsBtn = messageElement.querySelector('.message-actions');
    const rect = actionsBtn.getBoundingClientRect();
    
    // Calculate position to prevent menu from going off-screen
    let leftPos = rect.left;
    let topPos = rect.bottom + 5;
    
    // Adjust if menu would go off right edge
    if (leftPos + 180 > window.innerWidth) {
        leftPos = window.innerWidth - 190;
    }
    
    // Adjust if menu would go off bottom edge
    if (topPos + 300 > window.innerHeight) {
        topPos = rect.top - 250;
    }
    
    menu.style.left = `${leftPos}px`;
    menu.style.top = `${topPos}px`;
    
    // Add to body (not to message element)
    document.body.appendChild(menu);
    activeMessageActions = menu;
    
    // Prevent menu click from closing itself
    menu.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeMessageActions);
    }, 100);
}

function closeMessageActions() {
    if (activeMessageActions) {
        activeMessageActions.remove();
        activeMessageActions = null;
        document.removeEventListener('click', closeMessageActions);
    }
}

function createActionItem(text, onClick, className = '') {
    const item = document.createElement('button');
    item.className = `message-action-item ${className}`;
    item.textContent = text;
    item.onclick = onClick;
    return item;
}

function getMessageData(messageId) {
    // For the demo, we'll extract data from the DOM
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return null;
    
    const isMyMessage = messageElement.classList.contains('my-message');
    const senderID = isMyMessage ? currentUser : (currentUser === 'i' ? 'x' : 'i');
    
    // Extract message content
    const textContent = messageElement.querySelector('.message-text')?.textContent || '';
    const imageSrc = messageElement.querySelector('img')?.src || '';
    const message = textContent || imageSrc || '';
    const type = textContent ? 'text' : (imageSrc ? 'image' : 'text');
    
    return {
        _id: messageId,
        senderID: senderID,
        message: message,
        type: type,
        reactions: {}
    };
}

function startReply(messageData) {
    replyToMessage = messageData;
    
    // Show reply preview in input area
    const input = document.getElementById('input');
    const replyPreview = document.createElement('div');
    replyPreview.id = 'reply-preview';
    replyPreview.className = 'reply-container';
    replyPreview.style.cssText = 'position: absolute; bottom: 70px; left: 20px; right: 80px; z-index: 10;';
    replyPreview.innerHTML = `
        <div class="reply-text">Replying to ${messageData.senderID}</div>
        <div class="reply-message">${messageData.message}</div>
        <button onclick="cancelReply()" style="background: none; border: none; color: #8696a0; cursor: pointer; position: absolute; top: 8px; right: 8px;">✕</button>
    `;
    
    document.body.appendChild(replyPreview);
    input.focus();
}

function cancelReply() {
    replyToMessage = null;
    const replyPreview = document.getElementById('reply-preview');
    if (replyPreview) {
        replyPreview.remove();
    }
}

function copyMessage(messageData) {
    if (messageData.type === 'text') {
        navigator.clipboard.writeText(messageData.message).then(() => {
            showNotification('Message copied to clipboard');
        });
    }
}

function editMessage(messageData) {
    const messageElement = document.querySelector(`[data-message-id="${messageData._id}"]`);
    const contentDiv = messageElement.querySelector('.message-content');
    
    const editContainer = document.createElement('div');
    editContainer.className = 'message-edit-mode';
    
    const editInput = document.createElement('textarea');
    editInput.className = 'message-edit-input';
    editInput.value = messageData.message;
    editInput.rows = 2;
    
    const editActions = document.createElement('div');
    editActions.className = 'edit-actions';
    editActions.innerHTML = `
        <button class="edit-btn cancel" onclick="cancelEdit('${messageData._id}')">Cancel</button>
        <button class="edit-btn" onclick="saveEdit('${messageData._id}')">Save</button>
    `;
    
    editContainer.appendChild(editInput);
    editContainer.appendChild(editActions);
    
    contentDiv.style.display = 'none';
    contentDiv.parentNode.insertBefore(editContainer, contentDiv.nextSibling);
    
    editInput.focus();
    editInput.setSelectionRange(editInput.value.length, editInput.value.length);
}

function cancelEdit(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    const editContainer = messageElement.querySelector('.message-edit-mode');
    const contentDiv = messageElement.querySelector('.message-content');
    
    if (editContainer) {
        editContainer.remove();
    }
    contentDiv.style.display = 'block';
}

function saveEdit(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    const editInput = messageElement.querySelector('.message-edit-input');
    const newText = editInput.value.trim();
    
    if (newText) {
        // Send edit to server
        socket.emit('edit message', {
            messageId: messageId,
            newMessage: newText,
            senderID: currentUser
        });
        
        cancelEdit(messageId);
    }
}

function deleteMessage(messageData) {
    if (confirm('Are you sure you want to delete this message?')) {
        socket.emit('delete message', {
            messageId: messageData._id,
            senderID: currentUser
        });
    }
}

function forwardMessage(messageData) {
    const otherUser = currentUser === 'i' ? 'x' : 'i';
    
    const forwardData = {
        originalSender: messageData.senderID,
        message: messageData.message,
        type: messageData.type,
        forwarded: true,
        timestamp: new Date().toISOString()
    };
    
    socket.emit('forward message', forwardData);
    showNotification('Message forwarded');
}

function downloadFile(messageData) {
    if (messageData.type === 'image' || messageData.type === 'video' || messageData.type === 'document') {
        const link = document.createElement('a');
        link.href = messageData.message;
        link.download = messageData.message.split('/').pop() || 'download';
        link.target = '_blank';
        link.click();
    }
}

function addReaction(messageData, emoji) {
    socket.emit('add reaction', {
        messageId: messageData._id,
        emoji: emoji,
        userId: currentUser
    });
}

function toggleReaction(messageId, emoji) {
    socket.emit('toggle reaction', {
        messageId: messageId,
        emoji: emoji,
        userId: currentUser
    });
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: #2a3942;
        color: #e9edef;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 1000;
        animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// --- Enhanced Form Submission ---
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value && currentUser) {
        const messageData = {
            senderID: currentUser, 
            message: input.value,
            type: 'text',
            status: 'sent',
            timestamp: new Date().toISOString()
        };
        
        // Add reply info if replying
        if (replyToMessage) {
            messageData.replyTo = {
                messageId: replyToMessage._id,
                senderID: replyToMessage.senderID,
                message: replyToMessage.message
            };
        }
        
        socket.emit('chat message', messageData);
        input.value = '';
        cancelReply(); // Clear reply state
    }
});

// Photo button click handler
photoButton.addEventListener('click', () => {
    photoInput.click();
});

// Initialize user selection when DOM is ready
document.addEventListener('DOMContentLoaded', setupUserSelection);