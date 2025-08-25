const axios = require('axios');
const qrcode = require('qrcode');
require('dotenv').config();

class AuthService {
    constructor() {
        this.masterApiUrl = process.env.WASENDER_API_URL || 'https://api.wasender.com';
        this.masterApiKey = process.env.WASENDER_MASTER_API_KEY; // Master API key for managing sessions
        
        // Check if we have a Master API Key configured
        if (this.masterApiKey && this.masterApiKey.length > 0) {
            console.log('✅ Master API Key configured - Full multi-user system available');
        } else if (process.env.WASENDER_API_KEY) {
            // Fallback mode - use regular API key but mark as fallback
            this.masterApiKey = process.env.WASENDER_API_KEY;
            console.log('⚠️ Using regular API key as fallback - Limited multi-user functionality');
        } else {
            console.warn('⚠️ No API key configured. Multi-user system will not work.');
        }
        
        this.masterAxios = axios.create({
            baseURL: this.masterApiUrl,
            headers: {
                'Authorization': `Bearer ${this.masterApiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
    }

    // Check if WasenderApi is configured
    isConfigured() {
        // Check if we have a Master API Key configured
        // Since we're using the same API key for both master and regular, 
        // we'll check if the master key is set and valid
        if (this.masterApiKey && this.masterApiKey.length > 0) {
            // We have a Master API Key - check if it's working
            return true;
        }
        return false; // We're in fallback mode
    }

    // Check if phone number is an existing user
    async checkExistingUser(phoneNumber) {
        try {
            // In fallback mode, we need to distinguish between users
            // For now, let's use a simple approach: treat the first user as existing
            // and subsequent users as new (this is a temporary solution)
            
            // Check if this is the first/primary user (the one whose API key we have)
            const primaryPhoneNumber = process.env.PRIMARY_PHONE_NUMBER || '+918523862893';
            
            if (phoneNumber === primaryPhoneNumber) {
                // This is the primary user - treat as existing
                console.log(`🔐 Primary user detected: ${phoneNumber} - Using existing session`);
                return {
                    success: true,
                    exists: true,
                    connected: true,
                    session: {
                        id: 'primary_session',
                        phone_number: phoneNumber,
                        status: 'connected',
                        api_key: process.env.WASENDER_API_KEY,
                        created_at: new Date().toISOString()
                    }
                };
            } else {
                // This is a new user - should go to QR scanning
                console.log(`🆕 New user detected: ${phoneNumber} - Redirecting to QR setup`);
                return {
                    success: true,
                    exists: false,
                    connected: false,
                    session: null
                };
            }
            
        } catch (error) {
            console.error('❌ Error checking existing user:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Create new WhatsApp session for phone number
    async createNewSession(phoneNumber) {
        try {
            // In fallback mode, we can't create new WhatsApp sessions
            // because we don't have Master API Key access
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'Cannot create new WhatsApp sessions in fallback mode. Please contact administrator to get Master API Key access.'
                };
            }

            const sessionData = {
                name: `WhatsApp_${phoneNumber.replace('+', '')}`,
                phone_number: phoneNumber,
                account_protection: true,
                log_messages: true,
                webhook_enabled: false, // Disable webhook for local development
                read_incoming_messages: false,
                auto_reject_calls: false
            };

            console.log('🔍 Creating session with data:', JSON.stringify(sessionData, null, 2));
            console.log('🔑 Using Master API Key:', this.masterApiKey ? this.masterApiKey.substring(0, 10) + '...' : 'NOT SET');

            const response = await this.masterAxios.post('/api/whatsapp-sessions', sessionData);
            
            if (response.data && response.data.success) {
                console.log(`✅ Created new WhatsApp session for ${phoneNumber}`);
                return {
                    success: true,
                    session: response.data.data
                };
            } else {
                throw new Error(response.data.message || 'Failed to create session');
            }
            
        } catch (error) {
            console.error('❌ Error creating new session:', error.message);
            console.error('❌ Error response details:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get QR code for session
    async getQRCode(sessionId) {
        try {
            // In fallback mode, we can't create new WhatsApp sessions
            // because we don't have Master API Key access
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'Cannot create new WhatsApp sessions in fallback mode. Please contact administrator to get Master API Key access.'
                };
            }

            const response = await this.masterAxios.get(`/api/whatsapp-sessions/${sessionId}/qrcode`);
            
            if (response.data && response.data.success) {
                // Convert QR string to base64 image
                const qrImageBuffer = await qrcode.toBuffer(response.data.data.qrCode);
                const qrImageBase64 = qrImageBuffer.toString('base64');
                
                return {
                    success: true,
                    qrCode: response.data.data.qrCode,
                    qrImage: qrImageBase64
                };
            } else {
                throw new Error(response.data.message || 'Failed to generate QR code');
            }
            
        } catch (error) {
            console.error('❌ Error getting QR code:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Check connection status for a specific session
    async checkConnectionStatus(sessionId) {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'WasenderApi master key not configured'
                };
            }

            // First get session details to get the user's API key
            const sessionResponse = await this.masterAxios.get(`/api/whatsapp-sessions/${sessionId}`);
            
            if (!sessionResponse.data || !sessionResponse.data.success) {
                throw new Error('Failed to get session details');
            }

            const session = sessionResponse.data.data;
            const userApiKey = session.api_key;

            // Now check status using the user's API key
            const userAxios = axios.create({
                baseURL: this.masterApiUrl,
                headers: {
                    'Authorization': `Bearer ${userApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            const statusResponse = await userAxios.get('/api/status');
            
            if (statusResponse.data) {
                return {
                    success: true,
                    connected: statusResponse.data.status === 'connected',
                    status: statusResponse.data.status,
                    apiKey: userApiKey,
                    session: session
                };
            } else {
                throw new Error('Failed to get connection status');
            }
            
        } catch (error) {
            console.error('❌ Error checking connection status:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Logout/disconnect a user session
    async logoutSession(sessionId) {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'WasenderApi master key not configured'
                };
            }

            const response = await this.masterAxios.post(`/api/whatsapp-sessions/${sessionId}/disconnect`);
            
            if (response.data && response.data.success) {
                console.log(`✅ Successfully logged out session ${sessionId}`);
                return {
                    success: true,
                    message: 'Session logged out successfully'
                };
            } else {
                throw new Error(response.data.message || 'Failed to logout session');
            }
            
        } catch (error) {
            console.error('❌ Error logging out session:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Delete a user session completely
    async deleteSession(sessionId) {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'WasenderApi master key not configured'
                };
            }

            const response = await this.masterAxios.delete(`/api/whatsapp-sessions/${sessionId}`);
            
            if (response.data && response.data.success) {
                console.log(`✅ Successfully deleted session ${sessionId}`);
                return {
                    success: true,
                    message: 'Session deleted successfully'
                };
            } else {
                throw new Error(response.data.message || 'Failed to delete session');
            }
            
        } catch (error) {
            console.error('❌ Error deleting session:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get all active sessions (admin function)
    async getAllSessions() {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'WasenderApi master key not configured'
                };
            }

            console.log('🔍 Checking current sessions...');
            const response = await this.masterAxios.get('/api/whatsapp-sessions');
            console.log('📊 Current sessions:', JSON.stringify(response.data, null, 2));
            
            if (response.data && response.data.success) {
                return {
                    success: true,
                    sessions: response.data.data
                };
            } else {
                throw new Error('Failed to fetch sessions');
            }
            
        } catch (error) {
            console.error('❌ Error getting all sessions:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Regenerate API key for a session
    async regenerateApiKey(sessionId) {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'WasenderApi master key not configured'
                };
            }

            const response = await this.masterAxios.post(`/api/whatsapp-sessions/${sessionId}/regenerate-key`);
            
            if (response.data && response.data.success) {
                console.log(`✅ Successfully regenerated API key for session ${sessionId}`);
                return {
                    success: true,
                    newApiKey: response.data.data.api_key
                };
            } else {
                throw new Error(response.data.message || 'Failed to regenerate API key');
            }
            
        } catch (error) {
            console.error('❌ Error regenerating API key:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Update session settings
    async updateSession(sessionId, updates) {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'WasenderApi master key not configured'
                };
            }

            const response = await this.masterAxios.put(`/api/whatsapp-sessions/${sessionId}`, updates);
            
            if (response.data && response.data.success) {
                console.log(`✅ Successfully updated session ${sessionId}`);
                return {
                    success: true,
                    session: response.data.data
                };
            } else {
                throw new Error(response.data.message || 'Failed to update session');
            }
            
        } catch (error) {
            console.error('❌ Error updating session:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = AuthService;
