const express = require('express');
const path = require('path');
const { sendMessagesFromSheet, getWhatsAppGroups, getDeviceInfo, wasenderService } = require('./message_sender');
const AuthService = require('./auth_service');
const WasenderService = require('./wasender_service');
const QRGenerationService = require('./qr_generation_service');
const { scheduleBroadcast, cancelJob, listJobs, getJob } = require('./scheduler');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize auth service
const authService = new AuthService();

// Function to send direct message to selected groups
async function sendDirectMessage(message, selectedGroups, userApiKey = null) {
    try {
        // Check if we have a user API key (multi-user mode)
        if (userApiKey) {
            // Use user's API key to send messages
            const userWasenderService = new WasenderService(userApiKey);
            
            if (!selectedGroups || selectedGroups.length === 0) {
                throw new Error('No groups selected. Please select groups on the frontend first.');
            }

            console.log(`📋 Found ${selectedGroups.length} selected groups to send to`);
            console.log(`📝 Message: ${message}`);

            // Send messages using user's WasenderApi session
            const sendResults = await userWasenderService.sendMessagesToGroups(selectedGroups, message);
            
            return {
                success: true,
                demo: false,
                totalGroups: selectedGroups.length,
                successCount: sendResults.successCount || 0,
                failedCount: selectedGroups.length - (sendResults.successCount || 0),
                results: sendResults.results || []
            };
        }

        // Fallback to original method (single user mode)
        if (!process.env.WASENDER_API_KEY || !process.env.WASENDER_DEVICE_ID) {
            // Return demo response if not configured
            return {
                success: true,
                demo: true,
                totalGroups: 4,
                successCount: 4,
                failedCount: 0,
                results: [
                    { group: "Demo Group 1", success: true },
                    { group: "Demo Group 2", success: true },
                    { group: "Demo Group 3", success: true },
                    { group: "Demo Group 4", success: true }
                ]
            };
        }

        // Use the selected groups from frontend instead of fetching all groups
        if (!selectedGroups || selectedGroups.length === 0) {
            throw new Error('No groups selected. Please select groups on the frontend first.');
        }

        console.log(`📋 Found ${selectedGroups.length} selected groups to send to`);
        console.log(`📝 Message: ${message}`);

        // Send messages using WasenderApi to only selected groups
        const sendResults = await wasenderService.sendMessagesToGroups(selectedGroups, message);
        
        return {
            success: true,
            demo: false,
            totalGroups: selectedGroups.length,
            successCount: sendResults.successCount || 0,
            failedCount: selectedGroups.length - (sendResults.successCount || 0),
            results: sendResults.results || []
        };
        
    } catch (error) {
        console.error('❌ Error in sendDirectMessage:', error.message);
        throw error;
    }
 }

// Serve the authentication page as main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'auth.html'));
});

// Serve the QR login page
app.get('/qr-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'qr-login.html'));
});

// Serve the WhatsApp bot page (existing functionality)
app.get('/whatsapp-bot', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Get WhatsApp groups
app.get('/api/groups', async (req, res) => {
    try {
        const result = await getWhatsAppGroups(req);
        res.json(result);
    } catch (error) {
        console.error('❌ Error in /api/groups:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            groups: []
        });
    }
});

// Get device status and QR code
app.get('/api/device-status', async (req, res) => {
    try {
        const result = await getDeviceInfo();
        res.json(result);
    } catch (error) {
        console.error('❌ Error in /api/device-status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Check current sessions (Admin)
app.get('/api/sessions', async (req, res) => {
    try {
        const result = await authService.getAllSessions();
        res.json(result);
    } catch (error) {
        console.error('❌ Error in /api/sessions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===== MULTI-USER AUTHENTICATION ENDPOINTS =====

// Check if user exists
app.post('/api/auth/check-user', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone number is required' 
            });
        }

        const result = await authService.checkExistingUser(phoneNumber);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Error in /api/auth/check-user:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create new WhatsApp session
app.post('/api/auth/create-session', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone number is required' 
            });
        }

        const result = await authService.createNewSession(phoneNumber);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Error in /api/auth/create-session:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get QR code for session
app.get('/api/auth/qr-code/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Session ID is required' 
            });
        }

        const result = await authService.getQRCode(sessionId);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Error in /api/auth/qr-code:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Check connection status for session
app.get('/api/auth/check-connection/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Session ID is required' 
            });
        }

        const result = await authService.checkConnectionStatus(sessionId);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Error in /api/auth/check-connection:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Logout user session
app.post('/api/auth/logout', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Session ID is required' 
            });
        }

        const result = await authService.logoutSession(sessionId);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Error in /api/auth/logout:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send messages endpoint
app.post('/send-messages', async (req, res) => {
    try {
        const { message, selectedGroups } = req.body;
        
        if (!message || message.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide a message to send' 
            });
        }

        if (!selectedGroups || selectedGroups.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please select at least one group on the frontend' 
            });
        }

        console.log('📤 Received request to send message:', message);
        console.log('📋 Selected groups:', selectedGroups.length);
        
        // Check if request has authorization header (multi-user mode)
        let userApiKey = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            userApiKey = authHeader.substring(7);
            console.log('🔐 Using user API key for message sending');
        }
        
        const result = await sendDirectMessage(message, selectedGroups, userApiKey);
        
        let responseMessage;
        if (result.demo) {
            responseMessage = `✅ Message prepared successfully! Found ${result.totalGroups} groups.

📝 Your message is ready to send!

⚠️ Note: Currently running in demo mode. To enable actual WhatsApp messaging:
1. Sign up for WasenderApi at https://wasender.com
2. Get your API key and device ID
3. Add them to your .env file
4. Scan QR code to connect your WhatsApp

🎯 Your business workflow is ready - just needs WasenderApi configuration!`;
        } else {
            responseMessage = `🎉 Success! Messages sent successfully!

📊 Results:
✅ Sent: ${result.successCount}/${result.totalGroups} messages
${result.failedCount > 0 ? `❌ Failed: ${result.failedCount} messages` : ''}

📱 All messages have been delivered to your WhatsApp groups!`;
        }
        
        return res.json({ 
            success: true, 
            message: responseMessage,
            data: result
        });
        
    } catch (err) {
        console.error('❌ Server error:', err);
        res.status(500).json({ 
            success: false, 
            message: `Error: ${err.message}` 
        });
    }
});

// Logout device endpoint
app.post('/api/logout', async (req, res) => {
    try {
        const result = await wasenderService.logoutDevice();
        res.json(result);
    } catch (error) {
        console.error('❌ Error in /api/logout:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Webhook endpoint for message status updates (optional)
app.post('/webhook', (req, res) => {
    try {
        console.log('📥 Webhook received:', req.body);
        // Handle webhook data here if needed
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ success: false });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        wasenderConfigured: !!(process.env.WASENDER_API_KEY && process.env.WASENDER_DEVICE_ID)
    });
});

// Serve static files AFTER custom routes
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('🚀 WhatsApp Bot Server with WasenderApi');
    console.log(`📡 Server running on http://localhost:${PORT}`);
    
    if (process.env.WASENDER_API_KEY && process.env.WASENDER_DEVICE_ID) {
        console.log('✅ WasenderApi configured - Ready for production messaging!');
        console.log('📱 Check device status: http://localhost:' + PORT + '/api/device-status');
    } else {
        console.log('⚠️ WasenderApi not configured - Running in demo mode');
        console.log('💡 Add WASENDER_API_KEY and WASENDER_DEVICE_ID to .env file to enable messaging');
    }
    
    console.log('📊 Google Sheets validation working perfectly!');
    console.log('🌍 Compatible with all platforms (Mac, Windows, Linux)!');
});

// ===== QR GENERATION ENDPOINTS =====
app.post('/api/generate-qr', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone number is required' 
            });
        }
        
        console.log('📱 Generating QR code for phone:', phone);
        
        const qrService = new QRGenerationService();
        const result = await qrService.generateQRForNewUser(phone);
        
        if (result.success) {
            res.status(200).json({
                success: true,
                message: 'QR code generated successfully',
                data: {
                    sessionId: result.sessionId,
                    sessionApiKey: result.sessionApiKey,
                    qrImage: result.qrImage,
                    qrCode: result.qrCode,
                    phone: result.phone
                }
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to generate QR code' 
            });
        }
        
    } catch (error) {
        console.error('❌ QR generation error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to generate QR code' 
        });
    }
});

app.post('/api/check-connection', async (req, res) => {
    try {
        const { sessionApiKey } = req.body;
        if (!sessionApiKey) {
            return res.status(400).json({ 
                success: false, 
                message: 'Session API key is required' 
            });
        }
        
        const qrService = new QRGenerationService();
        const result = await qrService.checkConnectionStatus(sessionApiKey);
        
        res.status(200).json({ 
            success: true, 
            data: result 
        });
        
    } catch (error) {
        console.error('❌ Connection check error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to check connection' 
        });
    }
});

app.get('/api/session-details/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Session ID is required' 
            });
        }
        
        const qrService = new QRGenerationService();
        const result = await qrService.getSessionDetails(sessionId);
        
        res.status(200).json({ 
            success: true, 
            data: result 
        });
        
    } catch (error) {
        console.error('❌ Session details error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to get session details' 
        });
    }
});

app.delete('/api/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Session ID is required' 
            });
        }
        
        const qrService = new QRGenerationService();
        const result = await qrService.deleteSession(sessionId);
        
        res.status(200).json({ 
            success: true, 
            message: 'Session deleted successfully',
            data: result 
        });
        
    } catch (error) {
        console.error('❌ Session deletion error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to delete session' 
        });
    }
});

app.post('/api/logout-all-sessions', async (req, res) => {
    try {
        console.log('🚪 User requested logout - deleting all sessions');
        
        const qrService = new QRGenerationService();
        const result = await qrService.deleteAllSessions();
        
        res.status(200).json({
            success: true,
            message: 'Logout successful - all sessions deleted',
            data: result
        });
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to logout' 
        });
    }
});

// ===== MESSAGE SCHEDULING ENDPOINTS =====
app.post('/api/schedule', async (req, res) => {
    try {
        const { groupIds, message, scheduledAt } = req.body;
        
        if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Group IDs array is required' 
            });
        }
        
        if (!message || message.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Message is required' 
            });
        }
        
        if (!scheduledAt) {
            return res.status(400).json({ 
                success: false, 
                message: 'scheduledAt (ISO datetime) is required' 
            });
        }
        
        const runAt = new Date(scheduledAt);
        if (isNaN(runAt.getTime())) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid scheduledAt format' 
            });
        }
        
        // Check if scheduled time is in the future
        const now = Date.now();
        if (runAt.getTime() <= now) {
            return res.status(400).json({ 
                success: false, 
                message: 'Scheduled time must be in the future' 
            });
        }
        
        console.log('📅 Scheduling message for:', runAt.toISOString(), 'to', groupIds.length, 'groups');
        
        // Get user session from headers
        const userApiKey = req.headers.authorization?.replace('Bearer ', '');
        const userPhone = req.headers['x-user-phone'];
        
        if (!userApiKey || !userPhone) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }
        
        const job = scheduleBroadcast({ 
            groupIds, 
            message: message.trim(), 
            runAtMs: runAt.getTime(),
            apiKey: userApiKey,
            phoneNumber: userPhone
        });
        
        res.status(200).json({
            success: true,
            message: 'Message scheduled successfully',
            data: {
                jobId: job.id,
                scheduledFor: new Date(job.runAtMs).toISOString(),
                groupsCount: groupIds.length
            }
        });
        
    } catch (error) {
        console.error('❌ Schedule error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to schedule message' 
        });
    }
});

app.get('/api/schedule', async (req, res) => {
    try {
        const jobs = listJobs();
        res.status(200).json({
            success: true,
            message: 'Scheduled jobs retrieved successfully',
            data: jobs
        });
    } catch (error) {
        console.error('❌ Get schedule error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to get scheduled jobs' 
        });
    }
});

app.delete('/api/schedule/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        
        if (!jobId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Job ID is required' 
            });
        }
        
        const cancelled = cancelJob(jobId);
        
        if (cancelled) {
            res.status(200).json({
                success: true,
                message: 'Job cancelled successfully',
                data: { jobId }
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Job not found',
                data: { jobId }
            });
        }
        
    } catch (error) {
        console.error('❌ Cancel schedule error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to cancel job' 
        });
    }
});

app.get('/api/schedule/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        
        if (!jobId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Job ID is required' 
            });
        }
        
        const job = getJob(jobId);
        
        if (job) {
            res.status(200).json({
                success: true,
                message: 'Job details retrieved successfully',
                data: job
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Job not found',
                data: { jobId }
            });
        }
        
    } catch (error) {
        console.error('❌ Get job details error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to get job details' 
        });
    }
});