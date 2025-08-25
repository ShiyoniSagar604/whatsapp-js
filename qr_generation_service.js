const axios = require('axios');
const qrcode = require('qrcode');
require('dotenv').config();

class QRGenerationService {
    constructor() {
        this.masterApiKey = process.env.WASENDER_MASTER_API_KEY;
        this.apiUrl = 'https://wasenderapi.com/api';
        
        if (!this.masterApiKey) {
            throw new Error('WASENDER_MASTER_API_KEY is required for QR generation');
        }
        
        console.log('🔑 QR Generation Service initialized with Master API Key');
    }

    async generateQRForNewUser(phoneNumber) {
        try {
            
            // Step 1: Create WhatsApp Session
            console.log('📱 Creating session for:', phoneNumber);
            const sessionResult = await this.createSession(phoneNumber);
            
            // Step 2: Connect/Initialize Session (REQUIRED before QR)
            console.log('🔗 Initializing session...');
            await this.connectSession(sessionResult.sessionId);
            
            // Wait a moment for session to initialize
            console.log('⏳ Waiting for session to initialize...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Step 3: Get QR Code
            console.log('📱 Getting QR code...');
            const qrResult = await this.getQRCode(sessionResult.sessionId);
            
            // Step 4: Convert QR string to image
            const qrImage = await this.convertQRToImage(qrResult.qrCode);
            
            return {
                success: true,
                sessionId: sessionResult.sessionId,
                sessionApiKey: sessionResult.apiKey,
                qrImage: qrImage,
                qrCode: qrResult.qrCode,
                phone: phoneNumber
            };
            
        } catch (error) {
            console.error('❌ QR Generation failed:', error.message);
            
            // Log detailed error information for debugging
            if (error.response) {
                console.error('❌ Error response status:', error.response.status);
                console.error('❌ Error response data:', error.response.data);
            }
            
            throw error;
        }
    }

    // Step 1: Create Session - POST /api/whatsapp-sessions
    async createSession(phoneNumber) {
        const sessionData = {
            name: `WhatsApp_${phoneNumber.replace(/[^0-9]/g, '')}`,
            phone_number: phoneNumber,
            account_protection: true,
            log_messages: true,
            webhook_enabled: false,
            webhook_events: [
                "session.status",
                "messages.received"
            ]
        };

        console.log('🔍 Creating session with data:', sessionData);

        const response = await axios.post(`${this.apiUrl}/whatsapp-sessions`, sessionData, {
            headers: {
                'Authorization': `Bearer ${this.masterApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.data.success) {
            throw new Error(`Session creation failed: ${response.data.message || 'Unknown error'}`);
        }

        console.log('✅ Session created successfully:', response.data.data.id);
        return {
            sessionId: response.data.data.id,
            apiKey: response.data.data.api_key
        };
    }

    // Step 2: Initialize Session - POST /api/whatsapp-sessions/{id}/connect
    async connectSession(sessionId) {
        console.log('🔗 Connecting session:', sessionId);
        
        const response = await axios.post(`${this.apiUrl}/whatsapp-sessions/${sessionId}/connect`, {}, {
            headers: {
                'Authorization': `Bearer ${this.masterApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.data.success) {
            throw new Error(`Session connection failed: ${response.data.message || 'Unknown error'}`);
        }

        console.log('✅ Session connected successfully:', sessionId);
        return response.data;
    }

    // Step 3: Get QR Code - GET /api/whatsapp-sessions/{id}/qrcode
    async getQRCode(sessionId) {
        console.log('📱 Getting QR code for session:', sessionId);
        
        const response = await axios.get(`${this.apiUrl}/whatsapp-sessions/${sessionId}/qrcode`, {
            headers: {
                'Authorization': `Bearer ${this.masterApiKey}`
            }
        });

        if (!response.data.success) {
            throw new Error(`QR code retrieval failed: ${response.data.message || 'Unknown error'}`);
        }

        console.log('✅ QR code retrieved successfully');
        return {
            qrCode: response.data.data.qrCode
        };
    }

    // Step 4: Convert QR string to image
    async convertQRToImage(qrCodeString) {
        try {
            console.log('🔄 Converting QR string to image...');
            const qrImageBuffer = await qrcode.toBuffer(qrCodeString);
            const base64Image = qrImageBuffer.toString('base64');
            console.log('✅ QR image converted successfully');
            return base64Image;
        } catch (error) {
            throw new Error(`QR image conversion failed: ${error.message}`);
        }
    }

    // Step 5: Check Connection Status - GET /api/status
    async checkConnectionStatus(sessionApiKey) {
        try {
            console.log('🔍 Checking connection status...');
            
            const response = await axios.get(`${this.apiUrl}/status`, {
                headers: {
                    'Authorization': `Bearer ${sessionApiKey}`
                }
            });

            const isConnected = response.data.status === 'connected';
            console.log('📊 Connection status:', response.data.status, isConnected ? '✅' : '⏳');
            
            return {
                connected: isConnected,
                status: response.data.status
            };
            
        } catch (error) {
            console.error('❌ Failed to check connection status:', error.message);
            throw error;
        }
    }

    // Get session details
    async getSessionDetails(sessionId) {
        try {
            console.log('🔍 Getting session details for:', sessionId);
            
            const response = await axios.get(`${this.apiUrl}/whatsapp-sessions/${sessionId}`, {
                headers: {
                    'Authorization': `Bearer ${this.masterApiKey}`
                }
            });

            if (!response.data.success) {
                throw new Error(`Failed to get session details: ${response.data.message || 'Unknown error'}`);
            }

            console.log('✅ Session details retrieved successfully');
            return response.data.data;
            
        } catch (error) {
            console.error('❌ Failed to get session details:', error.message);
            throw error;
        }
    }

    // Delete session
    async deleteSession(sessionId) {
        try {
            console.log('🗑️ Deleting session:', sessionId);
            
            const response = await axios.delete(`${this.apiUrl}/whatsapp-sessions/${sessionId}`, {
                headers: {
                    'Authorization': `Bearer ${this.masterApiKey}`
                }
            });

            console.log('✅ Session deleted successfully:', sessionId);
            return response.data;
            
        } catch (error) {
            console.error('❌ Failed to delete session:', error.message);
            throw error;
        }
    }

    // Poll connection status until connected
    async pollConnectionStatus(sessionApiKey, maxAttempts = 60, intervalMs = 3000) {
        console.log('🔄 Starting connection status polling...');
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const status = await this.checkConnectionStatus(sessionApiKey);
                
                if (status.connected) {
                    console.log('✅ Connection established!');
                    return status;
                }
                
                console.log(`📊 Attempt ${attempt}/${maxAttempts}: Status - ${status.status}`);
                
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, intervalMs));
                }
                
            } catch (error) {
                console.error(`❌ Polling attempt ${attempt} failed:`, error.message);
            }
        }
        
        throw new Error('Connection timeout - QR code not scanned within expected time');
    }

    // Get All WhatsApp Sessions
    async getAllSessions() {
        try {
            console.log('🔍 Getting all WhatsApp sessions...');
            
            const response = await axios.get(`${this.apiUrl}/whatsapp-sessions`, {
                headers: {
                    'Authorization': `Bearer ${this.masterApiKey}`
                }
            });

            if (!response.data.success) {
                throw new Error(`Failed to get sessions: ${response.data.message || 'Unknown error'}`);
            }

            console.log('✅ All sessions retrieved successfully');
            return response.data.data;
            
        } catch (error) {
            console.error('❌ Failed to get all sessions:', error.message);
            throw error;
        }
    }

    // Disconnect WhatsApp Session
    async disconnectSession(sessionId) {
        try {
            console.log('🔌 Disconnecting session:', sessionId);
            
            const response = await axios.post(`${this.apiUrl}/whatsapp-sessions/${sessionId}/disconnect`, {}, {
                headers: {
                    'Authorization': `Bearer ${this.masterApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.data.success) {
                throw new Error(`Failed to disconnect session: ${response.data.message || 'Unknown error'}`);
            }

            console.log('✅ Session disconnected successfully:', sessionId);
            return response.data;
            
        } catch (error) {
            console.error('❌ Failed to disconnect session:', error.message);
            throw error;
        }
    }

    // Delete All Sessions (for logout)
    async deleteAllSessions() {
        try {
            console.log('🗑️ Deleting all WhatsApp sessions...');
            
            // First, get all sessions
            const sessions = await this.getAllSessions();
            
            if (!sessions || sessions.length === 0) {
                console.log('ℹ️ No sessions found to delete');
                return { success: true, message: 'No sessions to delete', deletedCount: 0 };
            }

            console.log(`📋 Found ${sessions.length} sessions to delete`);

            // Delete each session
            const deletePromises = sessions.map(async (session) => {
                try {
                    // First disconnect, then delete
                    console.log(`🔌 Disconnecting session: ${session.id}`);
                    await this.disconnectSession(session.id);
                    
                    console.log(`🗑️ Deleting session: ${session.id}`);
                    await this.deleteSession(session.id);
                    
                    console.log(`✅ Session ${session.id} deleted successfully`);
                    return { success: true, sessionId: session.id };
                    
                } catch (error) {
                    console.error(`❌ Failed to delete session ${session.id}:`, error.message);
                    return { success: false, sessionId: session.id, error: error.message };
                }
            });

            const results = await Promise.all(deletePromises);
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            console.log(`✅ Deleted ${successCount} sessions successfully`);
            if (failCount > 0) {
                console.log(`❌ Failed to delete ${failCount} sessions`);
            }

            return {
                success: true,
                message: `Deleted ${successCount} sessions successfully`,
                deletedCount: successCount,
                failedCount: failCount,
                results: results
            };
            
        } catch (error) {
            console.error('❌ Failed to delete all sessions:', error.message);
            throw error;
        }
    }
}

module.exports = QRGenerationService;
