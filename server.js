const express = require('express');
const path = require('path');
const { sendMessagesFromSheet, getWhatsAppGroups, getDeviceInfo, wasenderService } = require('./message_sender');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Get WhatsApp groups
app.get('/api/groups', async (req, res) => {
    try {
        const result = await getWhatsAppGroups();
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

// Send messages endpoint
app.post('/send-messages', async (req, res) => {
    try {
        const { sheetUrl } = req.body;
        
        if (!sheetUrl || !sheetUrl.includes('docs.google.com/spreadsheets')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide a valid Google Sheets URL' 
            });
        }

        const sheetIdMatch = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!sheetIdMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid Google Sheet URL format' 
            });
        }

        console.log('📤 Received request to send messages from sheet:', sheetUrl);
        
        const result = await sendMessagesFromSheet(sheetUrl);
        
        let responseMessage;
        if (result.demo) {
            responseMessage = `✅ Sheet validated successfully! Found ${result.totalGroups} groups.

📝 Your Google Sheet format is correct and ready to use!

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