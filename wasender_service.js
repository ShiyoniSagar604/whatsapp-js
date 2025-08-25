const axios = require('axios');
require('dotenv').config();

class WasenderService {
    constructor(apiKey = null, deviceId = null) {
        this.apiUrl = process.env.WASENDER_API_URL || 'https://api.wasender.com';
        
        // Support both single-user and multi-user modes
        if (apiKey) {
            // Multi-user mode: use provided API key
            this.apiKey = apiKey;
            this.deviceId = deviceId;
            console.log('🔐 Using user-provided API key for WasenderService');
        } else {
            // Single-user mode: use environment variables
            this.apiKey = process.env.WASENDER_API_KEY;
            this.deviceId = process.env.WASENDER_DEVICE_ID;
        }
        
        if (!this.apiKey) {
            console.warn('⚠️ WasenderApi credentials not configured. Running in demo mode.');
        }
        
        this.axiosInstance = axios.create({
            baseURL: this.apiUrl,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
    }

    // Check if WasenderApi is configured
    isConfigured() {
        return !!(this.apiKey && this.deviceId);
    }

    // Check if WhatsApp device is connected
    async checkDeviceStatus() {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    connected: false,
                    error: 'WasenderApi not configured'
                };
            }

            // Use the correct endpoint from WasenderApi
            const response = await this.axiosInstance.get(`/api/status`);
            return {
                success: true,
                connected: response.data.status === 'connected',
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error checking device status:', error.message);
            return {
                success: false,
                connected: false,
                error: error.message
            };
        }
    }

    // Get WhatsApp groups
    async getWhatsAppGroups() {
        try {
            // Always try to get real groups first, even in fallback mode
            console.log('🔍 Attempting to fetch real WhatsApp groups...');
            
            try {
                console.log(`🔍 Making API call to: ${this.apiUrl}/api/groups`);
                console.log(`🔑 Using API Key: ${this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'NOT SET'}`);
                
                const response = await this.axiosInstance.get(`/api/groups`);
                
                console.log(`📡 API Response Status: ${response.status}`);
                console.log(`📡 API Response Data:`, JSON.stringify(response.data, null, 2));
                
                if (response.data && response.data.data) {
                    const groups = response.data.data.map(group => ({
                        name: group.name || group.subject,
                        id: group.id,
                        participants: group.participants?.length || 0
                    }));
                    
                    console.log(`📋 Retrieved ${groups.length} WhatsApp groups from WasenderApi`);
                    return {
                        success: true,
                        groups: groups
                    };
                } else {
                    console.log('⚠️ API response missing data structure');
                }
            } catch (apiError) {
                console.error('❌ API Error Details:', {
                    message: apiError.message,
                    status: apiError.response?.status,
                    statusText: apiError.response?.statusText,
                    data: apiError.response?.data
                });
                console.log('⚠️ Failed to fetch real groups, falling back to demo groups');
            }
            
            // Only return demo groups if API call completely fails
            if (!this.isConfigured()) {
                console.log('📱 Using demo groups as fallback');
                return {
                    success: true,
                    groups: [
                        { name: "SWEET FAMILY 👭👫", id: "919937273113-1432715334@g.us", participants: 5 },
                        { name: "Sweethearts", id: "120363039709783445@g.us", participants: 8 },
                        { name: "Job For Fresher 😍 25", id: "120363042095015651@g.us", participants: 150 },
                        { name: "Hexagon 24 & 25 batch hiring", id: "120363418291416354@g.us", participants: 120 },
                        { name: "very good people kadu", id: "919949936388-1627061722@g.us", participants: 25 },
                        { name: "Wife is a machine!😶‍🌫🤫🥲🤭", id: "918886311786-1634824266@g.us", participants: 12 }
                    ]
                };
            }
            
            // If we reach here, return empty groups (API failed but we're configured)
            return {
                success: true,
                groups: []
            };
            
        } catch (error) {
            console.error('❌ Error fetching groups:', error.message);
            return {
                success: false,
                error: error.message,
                groups: []
            };
        }
    }

    // Send message to a group
    async sendMessageToGroup(groupId, message) {
        try {
            // Always try to send real message first
            console.log(`📤 Attempting to send real message to ${groupId}`);
            
            try {
                const payload = {
                    to: groupId,
                    text: message
                };

                const response = await this.axiosInstance.post(`/api/send-message`, payload);
                
                if (response.data.success) {
                    console.log(`✅ Message sent successfully to ${groupId}`);
                    return {
                        success: true,
                        messageId: response.data.messageId,
                        status: response.data.status
                    };
                } else {
                    throw new Error(response.data.message || 'Failed to send message');
                }
            } catch (apiError) {
                console.log(`⚠️ Failed to send real message: ${apiError.message}`);
                
                // Only simulate success if we're completely unconfigured
                if (!this.isConfigured()) {
                    console.log('📱 Simulating success in demo mode');
                    return {
                        success: true,
                        messageId: `demo_${Date.now()}`,
                        status: 'sent'
                    };
                }
                
                            // Re-throw the error if we're configured but API failed
            throw apiError;
        }
        
    } catch (error) {
        console.error(`❌ Error sending message to ${groupId}:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
    }

    // Send messages to multiple groups with delay
    async sendMessagesToGroups(groups, message, delayMs = 60000) {
        const results = [];
        let successCount = 0;
        
        console.log(`🚀 Starting to send messages to ${groups.length} groups...`);
        
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            console.log(`📤 Sending to: ${group.name} (${i + 1}/${groups.length})`);
            
            try {
                const result = await this.sendMessageToGroup(group.id, message);
                
                if (result.success) {
                    console.log(`✅ Sent to: ${group.name}`);
                    successCount++;
                    results.push({
                        group: group.name,
                        groupId: group.id,
                        success: true,
                        messageId: result.messageId
                    });
                } else {
                    console.log(`❌ Failed: ${group.name} - ${result.error}`);
                    results.push({
                        group: group.name,
                        groupId: group.id,
                        success: false,
                        error: result.error
                    });
                }
                
                // Add delay between messages to avoid rate limiting
                if (i < groups.length - 1) {
                    console.log(`⏳ Waiting ${delayMs}ms before next message...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                
            } catch (error) {
                console.log(`❌ Error: ${group.name} - ${error.message}`);
                results.push({
                    group: group.name,
                    groupId: group.id,
                    success: false,
                    error: error.message
                });
            }
        }
        
        console.log(`\n📊 Results: ${successCount}/${groups.length} messages sent successfully!`);
        
        return {
            totalGroups: groups.length,
            successCount: successCount,
            failedCount: groups.length - successCount,
            results: results
        };
    }

    // Get QR code for device connection
    async getQRCode() {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'WasenderApi not configured'
                };
            }

            const response = await this.axiosInstance.get(`/api/whatsapp-sessions/${this.deviceId}/qrcode`);
            return {
                success: true,
                qrCode: response.data.qr,
                qrImage: response.data.qrImage
            };
        } catch (error) {
            console.error('❌ Error getting QR code:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Logout device
    async logoutDevice() {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'WasenderApi not configured'
                };
            }

            const response = await this.axiosInstance.post(`/api/whatsapp-sessions/${this.deviceId}/disconnect`);
            return {
                success: true,
                message: 'Device logged out successfully'
            };
        } catch (error) {
            console.error('❌ Error logging out device:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = WasenderService;