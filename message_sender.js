const WasenderService = require('./wasender_service');
const fetch = require('node-fetch');

const wasenderService = new WasenderService();

async function sendMessagesFromSheet(sheetUrl) {
    try {
        console.log('📊 Reading Google Sheet...');
        
        // Validate sheet URL
        const sheetIdMatch = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!sheetIdMatch) {
            throw new Error('Invalid Google Sheet URL');
        }
        
        const sheetId = sheetIdMatch[1];
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
        
        // Fetch sheet data
        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new Error('Cannot access Google Sheet. Make sure it is publicly viewable.');
        }
        
        const csvData = await response.text();
        const lines = csvData.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('Google Sheet is empty');
        }
        
        // Parse message from A1
        const message = lines[0]?.split(',')[0]?.replace(/^"(.*)"$/, '$1');
        if (!message || message.trim() === '') {
            throw new Error('Message in cell A1 cannot be empty');
        }
        
        console.log('📝 Message:', message);
        
        // Parse groups from remaining rows
        const groups = [];
        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            if (columns.length >= 2) {
                const groupName = columns[0]?.replace(/^"(.*)"$/, '$1')?.trim();
                const groupId = columns[1]?.replace(/^"(.*)"$/, '$1')?.trim();
                if (groupName && groupId) {
                    groups.push({ name: groupName, id: groupId });
                }
            }
        }
        
        console.log(`📋 Found ${groups.length} groups to send to`);
        
        if (groups.length === 0) {
            throw new Error('No groups found in sheet. Make sure to include group data starting from row 2.');
        }
        
        // Check if WasenderApi is configured
        if (!process.env.WASENDER_API_KEY || !process.env.WASENDER_DEVICE_ID) {
            console.log('⚠️ WasenderApi not configured - running in demo mode');
            console.log('✅ In production, messages would be sent to:', groups.map(g => g.name).join(', '));
            return {
                success: true,
                demo: true,
                totalGroups: groups.length,
                successCount: groups.length,
                message: `Demo mode: Sheet validated successfully! Found ${groups.length} groups.`
            };
        }
        
        // Check device status
        const deviceStatus = await wasenderService.checkDeviceStatus();
        if (!deviceStatus.connected) {
            throw new Error('WhatsApp device not connected. Please scan QR code first or check device status.');
        }
        
        // Send messages using WasenderApi
        const sendResults = await wasenderService.sendMessagesToGroups(groups, message);
        
        return {
            success: true,
            demo: false,
            totalGroups: sendResults.totalGroups,
            successCount: sendResults.successCount,
            failedCount: sendResults.failedCount,
            results: sendResults.results,
            message: `Successfully sent ${sendResults.successCount}/${sendResults.totalGroups} messages!`
        };
        
    } catch (error) {
        console.error('❌ Error in sendMessagesFromSheet:', error.message);
        throw error;
    }
}

// Function to get groups from WasenderApi
async function getWhatsAppGroups(req) {
    try {
        // Check if request has authorization header (multi-user mode)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const userApiKey = authHeader.substring(7);
            
            // In fallback mode, we need to distinguish between users
            // For now, let's check if this is the primary user
            const primaryPhoneNumber = process.env.PRIMARY_PHONE_NUMBER || '+918523862893';
            
            // Extract phone number from session storage (this is a workaround)
            // In a real multi-user system, this would come from the database
            let userPhoneNumber = null;
            
            // Try to get user info from the request context
            if (req.headers['x-user-phone']) {
                userPhoneNumber = req.headers['x-user-phone'];
            }
            
            if (userPhoneNumber === primaryPhoneNumber) {
                // Primary user - get real groups
                console.log('🔐 Primary user - Getting real WhatsApp groups');
                const userWasenderService = new WasenderService(userApiKey);
                const result = await userWasenderService.getWhatsAppGroups();
                
                return {
                    success: result.success,
                    demo: false,
                    groups: result.groups || [],
                    error: result.error
                };
            } else {
                // New user - return demo groups or empty list
                console.log('🆕 New user - Returning demo groups');
                return {
                    success: true,
                    demo: true,
                    groups: [
                        { name: "Demo Group 1", id: "demo_1@g.us", participants: 5 },
                        { name: "Demo Group 2", id: "demo_2@g.us", participants: 8 },
                        { name: "Demo Group 3", id: "demo_3@g.us", participants: 12 }
                    ]
                };
            }
        }
        
        // Fallback to original method (single user mode)
        if (!process.env.WASENDER_API_KEY || !process.env.WASENDER_DEVICE_ID) {
            // Return demo groups if API not configured
            return {
                success: true,
                demo: true,
                groups: [
                    { name: "SWEET FAMILY 👭👫", id: "919937273113-1432715334@g.us", participants: 5 },
                    { name: "Sweethearts", id: "120363039709783445@g.us", participants: 8 },
                    { name: "Job For Fresher 😍 25", id: "120363042095015651@g.us", participants: 150 },
                    { name: "Hexagon 24 & 25 batch hiring", id: "120363418291416354@g.us", participants: 120 }
                ]
            };
        }
        
        const result = await wasenderService.getWhatsAppGroups();
        return {
            success: result.success,
            demo: false,
            groups: result.groups || [],
            error: result.error
        };
        
    } catch (error) {
        console.error('❌ Error getting WhatsApp groups:', error.message);
        return {
            success: false,
            error: error.message,
            groups: []
        };
    }
}

// Function to get device status and QR code
async function getDeviceInfo() {
    try {
        if (!process.env.WASENDER_API_KEY || !process.env.WASENDER_DEVICE_ID) {
            return {
                success: false,
                error: 'WasenderApi not configured',
                configured: false
            };
        }
        
        const [deviceStatus, qrResult] = await Promise.all([
            wasenderService.checkDeviceStatus(),
            wasenderService.getQRCode()
        ]);
        
        return {
            success: true,
            configured: true,
            connected: deviceStatus.connected,
            deviceStatus: deviceStatus.data,
            qrCode: qrResult.success ? qrResult.qrCode : null,
            qrImage: qrResult.success ? qrResult.qrImage : null,
            error: !deviceStatus.success ? deviceStatus.error : null
        };
        
    } catch (error) {
        console.error('❌ Error getting device info:', error.message);
        return {
            success: false,
            error: error.message,
            configured: true
        };
    }
}

module.exports = { 
    sendMessagesFromSheet, 
    getWhatsAppGroups, 
    getDeviceInfo,
    wasenderService 
};