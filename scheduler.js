const wasenderService = require('./wasender_service');

// In-memory scheduled jobs (lost on restart)
const scheduledJobs = new Map();
let nextId = 1;

const scheduleBroadcast = (params) => {
  const { groupIds, message, runAtMs, apiKey, phoneNumber } = params;
  const now = Date.now();
  const delay = Math.max(0, runAtMs - now);
  const id = String(nextId++);

  console.log(`[scheduler] Scheduled job ${id} at ${new Date(runAtMs).toISOString()} for ${groupIds.length} group(s)`);
  console.log(`[scheduler] Job ${id} will run in ${delay}ms (${Math.round(delay/1000)}s)`);
  console.log(`[scheduler] Job ${id} API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET'}`);

  const timeout = setTimeout(async () => {
    console.log(`[scheduler] Executing job ${id} at ${new Date().toISOString()}`);
    console.log(`[scheduler] Job ${id} using API key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET'}`);
    try {
      // Create WasenderService instance with user's API key
      const wasenderInstance = new wasenderService(apiKey);
      console.log(`[scheduler] Job ${id} created WasenderService instance`);
      
      // Check for connected session before sending
      const sessionsResponse = await wasenderInstance.checkDeviceStatus();
      console.log(`[scheduler] Job ${id} device status check result:`, sessionsResponse);
      if (!sessionsResponse || !sessionsResponse.connected) {
        console.warn('[scheduler] No active WhatsApp session at execution time; skipping job', id);
        scheduledJobs.delete(id);
        return;
      }
      
              for (const groupId of groupIds) {
            try {
                await wasenderInstance.sendMessageToGroup(groupId, message);
                console.log(`[scheduler] Sent to ${groupId}`);
                
                // Increase delay between messages to avoid rate limiting
                if (groupIds.indexOf(groupId) < groupIds.length - 1) {
                    console.log(`[scheduler] Waiting 60 seconds before next message...`);
                    await new Promise(resolve => setTimeout(resolve, 60000)); // 60 seconds
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
      console.error('[scheduler] Unexpected error executing job', id, err);
    } finally {
      scheduledJobs.delete(id);
      console.log(`[scheduler] Job ${id} completed`);
    }
  }, delay);

  scheduledJobs.set(id, { id, runAtMs, groupIds, message, timeout, apiKey, phoneNumber });
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
    ...job,
    runAt: new Date(job.runAtMs).toISOString(),
    status: 'scheduled'
  };
};

module.exports = {
  scheduleBroadcast,
  cancelJob,
  listJobs,
  getJob
};
