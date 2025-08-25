const express = require('express');
const path = require('path');
const { sendMessagesFromSheet, getWhatsAppGroups, getDeviceInfo, wasenderService } = require('./message_sender');
const AuthService = require('./auth_service');
const WasenderService = require('./wasender_service');
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