const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Minimal configuration for Docker
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Set to true for Docker
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images',
            '--disable-javascript',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--single-process',
            '--no-zygote'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable'
    }
});

let isClientReady = false;

client.on('qr', (qr) => {
    console.log('🔍 QR RECEIVED - Scan with WhatsApp:');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Waiting for scan...');
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp client authenticated!');
    console.log('⏳ Loading WhatsApp Web...');
});

client.on('ready', async () => {
    console.log('\n🎉 ✅ Client is ready!');
    console.log('📱 WhatsApp Web is now connected!');
    isClientReady = true;
    
    // Immediately try to get groups
    console.log('\n🔍 Fetching your WhatsApp groups...');
    
    try {
        // Wait a moment for everything to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('📋 Getting chats...');
        const chats = await client.getChats();
        console.log(`📊 Total chats found: ${chats.length}`);
        
        const groups = chats.filter(chat => chat.isGroup);
        console.log(`👥 Groups found: ${groups.length}`);
        
        if (groups.length === 0) {
            console.log('❌ No groups found. Make sure you have WhatsApp groups in your account.');
            return;
        }
        
        console.log('\n📋 📋 📋 COPY THIS TO YOUR GOOGLE SHEET 📋 📋 📋');
        console.log('=' .repeat(80));
        console.log('Cell A1: Your message goes here');
        console.log('Starting from row 2:');
        console.log('-'.repeat(80));
        
        groups.forEach((group, index) => {
            console.log(`Row ${index + 2}:`);
            console.log(`  A${index + 2}: ${group.name}`);
            console.log(`  B${index + 2}: ${group.id._serialized}`);
            console.log('');
        });
        
        console.log('=' .repeat(80));
        console.log('\n✅ ✅ ✅ SETUP COMPLETE! ✅ ✅ ✅');
        console.log('\n📝 Next steps:');
        console.log('1. Create a Google Sheet');
        console.log('2. Put your message in A1');
        console.log('3. Copy the group data above (starting from A2, B2)');
        console.log('4. Make sheet publicly viewable');
        console.log('5. Run: npm start');
        console.log('6. Use http://localhost:3000 to send messages');
        
        // Also save to a file for easy copying
        const fs = require('fs');
        let csvContent = 'Your message goes here,\n';
        groups.forEach(group => {
            csvContent += `"${group.name}","${group.id._serialized}"\n`;
        });
        
        fs.writeFileSync('groups.csv', csvContent);
        console.log('\n💾 Groups also saved to: groups.csv');
        
    } catch (error) {
        console.error('❌ Error fetching groups:', error);
        console.log('\n🔄 Trying again in 5 seconds...');
        setTimeout(async () => {
            try {
                await showGroups();
            } catch (e) {
                console.log('❌ Still having issues. Try restarting the bot.');
            }
        }, 5000);
    }
});

// Separate function to show groups
async function showGroups() {
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);
    
    console.log('\n📋 Your WhatsApp Groups:');
    groups.forEach((group, index) => {
        console.log(`${index + 1}. ${group.name} → ${group.id._serialized}`);
    });
}

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    console.log('💡 Try deleting the session folder and scan QR again');
});

client.on('disconnected', (reason) => {
    console.log('📱 Disconnected:', reason);
    if (reason === 'LOGOUT') {
        console.log('🔄 Attempting to reconnect...');
        client.initialize();
    }
});

// Simple function to read sheet and send messages
async function sendMessagesFromSheet(sheetUrl) {
    try {
        if (!isClientReady) {
            throw new Error('WhatsApp client not ready. Please scan QR code first.');
        }

        console.log('📊 Reading Google Sheet...');
        
        // Get sheet ID
        const sheetIdMatch = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!sheetIdMatch) {
            throw new Error('Invalid Google Sheet URL');
        }
        
        const sheetId = sheetIdMatch[1];
        const fetch = require('node-fetch');
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
        
        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new Error('Cannot access Google Sheet. Make sure it is publicly viewable.');
        }
        
        const csvData = await response.text();
        const lines = csvData.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('Google Sheet is empty');
        }
        
        // Get message from A1
        const message = lines[0].split(',')[0].replace(/^"(.*)"$/, '$1');
        console.log('📝 Message:', message);
        
        // Get groups from remaining lines
        const groups = [];
        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            if (columns.length >= 2) {
                const groupName = columns[0].replace(/^"(.*)"$/, '$1').trim();
                const groupId = columns[1].replace(/^"(.*)"$/, '$1').trim();
                if (groupName && groupId) {
                    groups.push({ name: groupName, id: groupId });
                }
            }
        }
        
        console.log(`📋 Found ${groups.length} groups to send to`);
        
        if (groups.length === 0) {
            throw new Error('No groups found in sheet');
        }
        
        let successCount = 0;
        console.log('\n🚀 Sending messages...');
        
        for (let group of groups) {
            try {
                await client.sendMessage(group.id, message);
                console.log(`✅ Sent to: ${group.name}`);
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
            } catch (error) {
                console.log(`❌ Failed: ${group.name} - ${error.message}`);
            }
        }
        
        console.log(`\n📊 Results: ${successCount}/${groups.length} messages sent successfully!`);
        return successCount;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

console.log('🚀 Starting WhatsApp Bot...');
console.log('📱 Make sure WhatsApp Web is closed in other browser tabs\n');

client.initialize();

module.exports = { sendMessagesFromSheet };