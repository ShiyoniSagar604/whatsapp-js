const WasenderService = require('./wasender_service');
const AuthService = require('./auth_service');
const fetch = require('node-fetch');

// Initialize auth service to get dynamic session details
const authService = new AuthService();

// Function to get current active session details
async function getCurrentActiveSession() {
    try {
        const sessionsResult = await authService.getAllSessions();
        
        if (sessionsResult.success && sessionsResult.sessions && sessionsResult.sessions.length > 0) {
            // Find a connected session first, fallback to any session
            const connectedSession = sessionsResult.sessions.find(s => s.status === 'connected');
            const activeSession = connectedSession || sessionsResult.sessions[0];
            
            console.log(`🔍 Using session: ${activeSession.phone_number} (${activeSession.status})`);
            return {
                success: true,
                session: activeSession,
                apiKey: activeSession.api_key,
                sessionId: activeSession.id,
                connected: activeSession.status === 'connected'
            };
        } else {
            return {
                success: false,
                error: 'No active WhatsApp session found'
            };
        }
    } catch (error) {
        console.error('❌ Error getting current session:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Function to wait for session connection
async function waitForSessionConnection(apiKey, maxAttempts = 10, delayMs = 3000) {
    console.log('⏳ Waiting for WhatsApp session to fully connect...');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const wasenderService = new WasenderService(apiKey);
            const statusResult = await wasenderService.checkDeviceStatus();
            
            console.log(`📊 Connection attempt ${attempt}/${maxAttempts}: ${statusResult.data?.status || 'unknown'}`);
            
            if (statusResult.connected) {
                console.log('✅ WhatsApp session is fully connected!');
                return { success: true, connected: true };
            }
            
            if (attempt < maxAttempts) {
                console.log(`⏳ Waiting ${delayMs}ms before next check...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
        } catch (error) {
            console.error(`❌ Connection check attempt ${attempt} failed:`, error.message);
        }
    }
    
    return { 
        success: false, 
        connected: false, 
        error: 'WhatsApp session connection timeout' 
    };
}

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
        
        // Get current active session dynamically
        const sessionResult = await getCurrentActiveSession();
        if (!sessionResult.success) {
            console.log('⚠️ No active session - running in demo mode');
            return {
                success: true,
                demo: true,
                totalGroups: groups.length,
                successCount: groups.length,
                message: `Demo mode: Sheet validated successfully! Found ${groups.length} groups.`
            };
        }
        
        // Wait for session to be fully connected
        if (!sessionResult.connected) {
            const connectionResult = await waitForSessionConnection(sessionResult.apiKey);
            if (!connectionResult.connected) {
                throw new Error('WhatsApp session not connected. Please scan QR code and wait for connection.');
            }
        }
        
        // Use current session's API key
        const wasenderService = new WasenderService(sessionResult.apiKey);
        
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

// Function to get groups from WasenderApi with dynamic session management
async function getWhatsAppGroups(req) {
    try {
        // Check if request has authorization header (multi-user mode)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const userApiKey = authHeader.substring(7);
            console.log('🔐 Using provided user API key for groups');
            
            // First check if session is connected
            const wasenderService = new WasenderService(userApiKey);
            const statusCheck = await wasenderService.checkDeviceStatus();
            
            if (!statusCheck.connected) {
                console.log('⏳ Session not connected yet, waiting...');
                // Wait for connection before fetching groups
                const connectionResult = await waitForSessionConnection(userApiKey, 5, 2000);
                
                if (!connectionResult.connected) {
                    return {
                        success: true,
                        demo: false,
                        groups: [],
                        error: 'WhatsApp session not connected yet. Please scan QR code and wait a moment.',
                        needsConnection: true
                    };
                }
            }
            
            // Session is connected, fetch groups
            const result = await wasenderService.getWhatsAppGroups();
            
            return {
                success: result.success,
                demo: false,
                groups: result.groups || [],
                error: result.error
            };
        }
        
        // Fallback: Get current active session dynamically
        const sessionResult = await getCurrentActiveSession();
        if (!sessionResult.success) {
            // Return demo groups if no active session
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
        
        // Check connection status
        if (!sessionResult.connected) {
            console.log('⏳ Waiting for session connection...');
            const connectionResult = await waitForSessionConnection(sessionResult.apiKey, 5, 2000);
            
            if (!connectionResult.connected) {
                return {
                    success: true,
                    demo: false,
                    groups: [],
                    error: 'WhatsApp session not connected yet. Please scan QR code and wait a moment.',
                    needsConnection: true
                };
            }
        }
        
        // Use current session's API key
        const wasenderService = new WasenderService(sessionResult.apiKey);
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

// Function to get device status and QR code with dynamic session management
async function getDeviceInfo() {
    try {
        // Get current active session
        const sessionResult = await getCurrentActiveSession();
        if (!sessionResult.success) {
            return {
                success: false,
                error: 'No active WhatsApp session found',
                configured: false
            };
        }
        
        // Use current session's API key  
        const wasenderService = new WasenderService(sessionResult.apiKey);
        
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
            error: !deviceStatus.success ? deviceStatus.error : null,
            session: sessionResult.session
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
    getCurrentActiveSession,
    waitForSessionConnection
};