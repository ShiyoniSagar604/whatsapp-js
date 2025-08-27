const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
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

// ===== DYNAMIC URL DETECTION =====

// Function to automatically detect the correct base URL for images
function getBaseUrl(req) {
    // 1. Check environment variable first (for production)
    if (process.env.PUBLIC_URL) {
        console.log(`🌍 Using PUBLIC_URL from environment: ${process.env.PUBLIC_URL}`);
        return process.env.PUBLIC_URL;
    }
    
    // 2. Check if request is coming through ngrok (development)
    const host = req.get('Host');
    const protocol = req.get('X-Forwarded-Proto') || req.protocol;
    
    if (host && host.includes('ngrok')) {
        const ngrokUrl = `https://${host}`; // ngrok always uses https
        console.log(`🔗 Detected ngrok URL: ${ngrokUrl}`);
        return ngrokUrl;
    }
    
    // 3. Check for other reverse proxies (Heroku, Vercel, etc.)
    if (req.headers['x-forwarded-host']) {
        const forwardedProtocol = req.headers['x-forwarded-proto'] || 'https';
        const forwardedUrl = `${forwardedProtocol}://${req.headers['x-forwarded-host']}`;
        console.log(`🔗 Detected forwarded URL: ${forwardedUrl}`);
        return forwardedUrl;
    }
    
    // 4. Fallback to current request (localhost in development)
    const fallbackUrl = `${protocol}://${host}`;
    console.log(`🔗 Using fallback URL: ${fallbackUrl}`);
    return fallbackUrl;
}

// ===== IMAGE UPLOAD CONFIGURATION =====

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Create unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '');
        cb(null, 'whatsapp-' + uniqueSuffix + '-' + sanitizedName);
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1 // Only one file at a time
    },
    fileFilter: (req, file, cb) => {
        // Only allow specific image types
        const allowedTypes = [
            'image/jpeg', 
            'image/jpg', 
            'image/png', 
            'image/webp'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.'), false);
        }
    }
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== IMAGE UPLOAD ENDPOINT =====
app.post('/api/upload-image', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        // Automatically detect the correct base URL
        const baseUrl = getBaseUrl(req);
        const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

        console.log(`📷 Image uploaded: ${req.file.filename}`);
        console.log(`🔗 Base URL detected: ${baseUrl}`);
        console.log(`🔗 Full Image URL: ${imageUrl}`);
        
        // Warn if still localhost
        if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
            console.warn(`⚠️ WARNING: Using localhost URL. WasenderAPI will reject this.`);
            console.warn(`💡 Access via ngrok URL to fix this issue`);
        }

        res.json({
            success: true,
            message: 'Image uploaded successfully',
            imageUrl: imageUrl,
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            baseUrl: baseUrl, // Include for debugging
            isLocalhost: imageUrl.includes('localhost')
        });

    } catch (error) {
        console.error('❌ Image upload error:', error);
        
        // Handle multer-specific errors
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    error: 'Image file size must be less than 5MB'
                });
            }
        }
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to upload image'
        });
    }
});

// ===== DEBUG ENDPOINT =====
app.get('/api/debug/urls', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.json({
        detectedBaseUrl: baseUrl,
        requestHeaders: {
            host: req.get('Host'),
            'x-forwarded-proto': req.get('X-Forwarded-Proto'),
            'x-forwarded-host': req.get('X-Forwarded-Host'),
            protocol: req.protocol
        },
        environment: {
            PUBLIC_URL: process.env.PUBLIC_URL,
            NODE_ENV: process.env.NODE_ENV
        }
    });
});

// ===== ENHANCED SEND MESSAGE FUNCTION =====

// Function to send direct message to selected groups (Enhanced for images)
async function sendDirectMessage(message, selectedGroups, userApiKey = null, imageUrl = null) {
    try {
        console.log(`📤 Sending message with image support:`);
        console.log(`📝 Message: ${message || '[No text]'}`);
        console.log(`🖼️ Image URL: ${imageUrl || '[No image]'}`);
        console.log(`📋 Groups: ${selectedGroups.length}`);

        // Check if we have a user API key (multi-user mode)
        if (userApiKey) {
            // Use user's API key to send messages
            const userWasenderService = new WasenderService(userApiKey);
            
            if (!selectedGroups || selectedGroups.length === 0) {
                throw new Error('No groups selected. Please select groups on the frontend first.');
            }

            // Send messages using user's WasenderApi session (with image support)
            const sendResults = await userWasenderService.sendMessagesToGroups(
                selectedGroups, 
                message, 
                60000, // 1 minute delay
                imageUrl
            );
            
            return {
                success: true,
                demo: false,
                totalGroups: selectedGroups.length,
                successCount: sendResults.successCount || 0,
                failedCount: selectedGroups.length - (sendResults.successCount || 0),
                results: sendResults.results || [],
                hasImage: !!imageUrl
            };
        }

        // Fallback to original method (single user mode)
        if (!process.env.WASENDER_API_KEY || !process.env.WASENDER_DEVICE_ID) {
            // Return demo response if not configured
            return {
                success: true,
                demo: true,
                totalGroups: selectedGroups.length,
                successCount: selectedGroups.length,
                failedCount: 0,
                results: selectedGroups.map((group, index) => ({
                    group: group.name || `Demo Group ${index + 1}`,
                    success: true,
                    type: imageUrl ? 'image' : 'text'
                })),
                hasImage: !!imageUrl
            };
        }

        // Use the selected groups from frontend instead of fetching all groups
        if (!selectedGroups || selectedGroups.length === 0) {
            throw new Error('No groups selected. Please select groups on the frontend first.');
        }

        // Send messages using WasenderApi to only selected groups (with image support)
        const sendResults = await wasenderService.sendMessagesToGroups(
            selectedGroups, 
            message, 
            60000, // 1 minute delay
            imageUrl
        );
        
        return {
            success: true,
            demo: false,
            totalGroups: selectedGroups.length,
            successCount: sendResults.successCount || 0,
            failedCount: selectedGroups.length - (sendResults.successCount || 0),
            results: sendResults.results || [],
            hasImage: !!imageUrl
        };
        
    } catch (error) {
        console.error('❌ Error in sendDirectMessage:', error.message);
        throw error;
    }
}

// ===== EXISTING ROUTES =====

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

// ===== ENHANCED SEND MESSAGES ENDPOINT =====
app.post('/send-messages', async (req, res) => {
    try {
        const { message, selectedGroups, imageUrl, hasImage } = req.body;
        
        // Validation: Must have either message or image
        if ((!message || message.trim() === '') && !hasImage) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide a message or upload an image' 
            });
        }

        if (!selectedGroups || selectedGroups.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please select at least one group on the frontend' 
            });
        }

        console.log('📤 Received enhanced message request:');
        console.log(`📝 Message: ${message || '[No text]'}`);
        console.log(`🖼️ Image: ${hasImage ? 'Yes' : 'No'}`);
        console.log(`📋 Selected groups: ${selectedGroups.length}`);
        
        // Check if request has authorization header (multi-user mode)
        let userApiKey = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            userApiKey = authHeader.substring(7);
            console.log('🔐 Using user API key for message sending');
        }
        
        const result = await sendDirectMessage(
            message, 
            selectedGroups, 
            userApiKey, 
            hasImage ? imageUrl : null
        );
        
        let responseMessage;
        if (result.demo) {
            const contentType = result.hasImage ? 
                (message ? 'message with image' : 'image') : 'message';
            
            responseMessage = `✅ ${contentType.charAt(0).toUpperCase() + contentType.slice(1)} prepared successfully! Found ${result.totalGroups} groups.

📝 Your content is ready to send!

⚠️ Note: Currently running in demo mode. To enable actual WhatsApp messaging:
1. Sign up for WasenderApi at https://wasender.com
2. Get your API key and device ID
3. Add them to your .env file
4. Scan QR code to connect your WhatsApp

🎯 Your business workflow is ready - just needs WasenderApi configuration!`;
        } else {
            const contentType = result.hasImage ? 
                (message ? 'messages with images' : 'images') : 'messages';
            
            responseMessage = `🎉 Success! ${contentType.charAt(0).toUpperCase() + contentType.slice(1)} sent successfully!

📊 Results:
✅ Sent: ${result.successCount}/${result.totalGroups} ${contentType}
${result.failedCount > 0 ? `❌ Failed: ${result.failedCount} ${contentType}` : ''}

📱 All content has been delivered to your WhatsApp groups!`;
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
        wasenderConfigured: !!(process.env.WASENDER_API_KEY && process.env.WASENDER_DEVICE_ID),
        uploadsDirectory: fs.existsSync('./uploads') ? 'exists' : 'missing',
        baseUrl: getBaseUrl(req)
    });
});

// Serve static files AFTER custom routes
app.use(express.static(__dirname));

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

// ===== ENHANCED MESSAGE SCHEDULING ENDPOINTS =====
app.post('/api/schedule', async (req, res) => {
    try {
        const { groupIds, message, scheduledAt, imageUrl, hasImage } = req.body;
        
        if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Group IDs array is required' 
            });
        }
        
        // Must have either message or image
        if ((!message || message.trim() === '') && !hasImage) {
            return res.status(400).json({ 
                success: false, 
                message: 'Message or image is required' 
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
        
        const contentType = hasImage ? 
            (message ? 'message with image' : 'image') : 'message';
        
        console.log(`📅 Scheduling ${contentType} for:`, runAt.toISOString(), 'to', groupIds.length, 'groups');
        
        // Get user session from headers
        const userApiKey = req.headers.authorization?.replace('Bearer ', '');
        const userPhone = req.headers['x-user-phone'];
        
        if (!userApiKey || !userPhone) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }
        
        const jobData = { 
            groupIds, 
            message: message?.trim() || '', 
            runAtMs: runAt.getTime(),
            apiKey: userApiKey,
            phoneNumber: userPhone
        };

        // Add image data if present
        if (hasImage && imageUrl) {
            jobData.imageUrl = imageUrl;
            jobData.hasImage = true;
        }
        
        const job = scheduleBroadcast(jobData);
        
        res.status(200).json({
            success: true,
            message: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} scheduled successfully`,
            data: {
                jobId: job.id,
                scheduledFor: new Date(job.runAtMs).toISOString(),
                groupsCount: groupIds.length,
                hasImage: !!hasImage,
                contentType: contentType
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

// ===== ERROR HANDLING MIDDLEWARE =====

// Handle multer errors
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Image file size must be less than 5MB'
            });
        }
        return res.status(400).json({
            success: false,
            error: error.message
        });
    }
    next(error);
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('❌ Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('🚀 Enhanced WhatsApp Bot Server with Image Support');
    console.log(`📡 Server running on http://localhost:${PORT}`);
    
    // Check and create uploads directory
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('📁 Created uploads directory');
    }
    
    // Log configuration status
    console.log('\n📋 Configuration Status:');
    console.log(`🔑 Master API Key: ${process.env.WASENDER_MASTER_API_KEY ? 'SET' : 'NOT SET'}`);
    console.log(`🌍 API URL: ${process.env.WASENDER_API_URL}`);
    console.log(`📁 Uploads Directory: ${fs.existsSync(uploadDir) ? 'Ready' : 'Missing'}`);
    console.log(`🔗 PUBLIC_URL: ${process.env.PUBLIC_URL || 'Auto-detect mode'}`);
    
    if (process.env.WASENDER_API_KEY && process.env.WASENDER_DEVICE_ID) {
        console.log('✅ Single-user WasenderApi configured - Ready for production messaging with images!');
        console.log('📱 Check device status: http://localhost:' + PORT + '/api/device-status');
    } else {
        console.log('⚠️ Single-user WasenderApi not configured - Multi-user mode enabled');
    }
    
    console.log('\n🔗 Important URLs:');
    console.log('📷 Image upload endpoint: http://localhost:' + PORT + '/api/upload-image');
    console.log('🔍 URL debug endpoint: http://localhost:' + PORT + '/api/debug/urls');
    console.log('📊 Health check: http://localhost:' + PORT + '/health');
    console.log('\n🌍 For ngrok access, use: https://your-ngrok-url.ngrok-free.app');
});