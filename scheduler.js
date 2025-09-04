const WasenderService = require('./wasender_service');

// In-memory scheduled jobs (lost on restart)
const scheduledJobs = new Map();
let nextId = 1;

const scheduleBroadcast = (params) => {
    const { groupIds, message, runAtMs, apiKey, phoneNumber, imageUrl, hasImage } = params;
    const now = Date.now();
    const delay = Math.max(0, runAtMs - now);
    const id = String(nextId++);

    // Determine content type for logging
    const contentType = hasImage ? (message && message.trim() ? 'mixed message (text + image)' : 'image') : 'text message';

    console.log(`[scheduler] Scheduled job ${id} at ${new Date(runAtMs).toISOString()} for ${groupIds.length} group(s)`);
    console.log(`[scheduler] Job ${id} content type: ${contentType}`);
    console.log(`[scheduler] Job ${id} will run in ${delay}ms (${Math.round(delay/1000)}s)`);
    console.log(`[scheduler] Job ${id} API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET'}`);
    console.log(`[scheduler] Job ${id} has image: ${hasImage ? 'Yes' : 'No'}`);
    console.log(`[scheduler] Job ${id} image URL: ${imageUrl || 'None'}`);

    const timeout = setTimeout(async () => {
        console.log(`[scheduler] Executing job ${id} at ${new Date().toISOString()}`);
        console.log(`[scheduler] Job ${id} using API key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET'}`);
        
        try {
            // Create WasenderService instance with user's API key
            const wasenderInstance = new WasenderService(apiKey);
            console.log(`[scheduler] Job ${id} created WasenderService instance`);
            
            // Check for connected session before sending
            const sessionsResponse = await wasenderInstance.checkDeviceStatus();
            console.log(`[scheduler] Job ${id} device status check result:`, sessionsResponse);
            
            if (!sessionsResponse || !sessionsResponse.connected) {
                console.warn(`[scheduler] No active WhatsApp session at execution time; skipping job ${id}`);
                scheduledJobs.delete(id);
                return;
            }
            
            // Enhanced execution logic with image support
            for (let i = 0; i < groupIds.length; i++) {
                const groupId = groupIds[i];
                console.log(`[scheduler] Processing group ${groupId} (${i + 1}/${groupIds.length})`);
                
                try {
                    let sendResult;
                    
                    // FIXED: Send based on content type
                    if (hasImage && imageUrl && message && message.trim()) {
                        // Mixed message: text + image
                        console.log(`[scheduler] Sending mixed message to ${groupId}`);
                        sendResult = await wasenderInstance.sendMixedMessageToGroup(groupId, message, imageUrl);
                    } else if (hasImage && imageUrl) {
                        // Image only (with optional caption)
                        console.log(`[scheduler] Sending image to ${groupId}`);
                        sendResult = await wasenderInstance.sendImageToGroup(groupId, message || '', imageUrl);
                    } else {
                        // Text only (original behavior)
                        console.log(`[scheduler] Sending text message to ${groupId}`);
                        sendResult = await wasenderInstance.sendMessageToGroup(groupId, message);
                    }

                    if (sendResult && sendResult.success) {
                        console.log(`[scheduler] Successfully sent to ${groupId}`);
                    } else {
                        console.warn(`[scheduler] Failed to send to ${groupId}: ${sendResult?.error || 'Unknown error'}`);
                    }
                    
                    // Add delay between messages to avoid rate limiting
                    if (i < groupIds.length - 1) {
                        // Random delay between 10-30 seconds
                        const randomDelay = Math.floor(Math.random() * (30000 - 10000 + 1)) + 10000;
                        console.log(`[scheduler] Waiting ${Math.round(randomDelay/1000)} seconds before next message...`);
                        await new Promise(resolve => setTimeout(resolve, randomDelay));
                    }
                    
                } catch (err) {
                    console.warn(`[scheduler] Failed to send to ${groupId}: ${err?.message || err}`);
                    
                    // If rate limited, wait longer before next attempt
                    if (err?.message?.includes('429')) {
                        console.log(`[scheduler] Rate limited detected, waiting 2 minutes before next message...`);
                        await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes
                    }
                }
            }
            
        } catch (err) {
            console.error(`[scheduler] Unexpected error executing job ${id}:`, err);
        } finally {
            scheduledJobs.delete(id);
            console.log(`[scheduler] Job ${id} completed and cleaned up`);
        }
    }, delay);

    // FIXED: Store image data in scheduled job
    scheduledJobs.set(id, { 
        id, 
        runAtMs, 
        groupIds, 
        message, 
        timeout, 
        apiKey, 
        phoneNumber,
        imageUrl: imageUrl || null,
        hasImage: hasImage || false
    });
    
    return { id, runAtMs };
};

const cancelJob = (id) => {
    const job = scheduledJobs.get(id);
    if (!job) return false;
    
    clearTimeout(job.timeout);
    scheduledJobs.delete(id);
    console.log(`[scheduler] Cancelled job ${id}`);
    return true;
};

const listJobs = () => {
    return Array.from(scheduledJobs.values()).map(({ timeout, apiKey, phoneNumber, ...rest }) => ({
        ...rest,
        runAt: new Date(rest.runAtMs).toISOString(),
        status: 'scheduled'
    }));
};

const getJob = (id) => {
    const job = scheduledJobs.get(id);
    if (!job) return null;
    
    return {
        id: job.id,
        runAtMs: job.runAtMs,
        groupIds: job.groupIds,
        message: job.message,
        runAt: new Date(job.runAtMs).toISOString(),
        status: 'scheduled',
        hasImage: job.hasImage,
        imageUrl: job.imageUrl
    };
};

module.exports = {
    scheduleBroadcast,
    cancelJob,
    listJobs,
    getJob
};