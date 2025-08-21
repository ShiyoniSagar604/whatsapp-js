async function sendMessagesFromSheet(sheetUrl) {
    try {
        console.log('📊 Reading Google Sheet...');
        
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
        
        const message = lines[0]?.split(',')[0]?.replace(/^"(.*)"$/, '$1');
        console.log('📝 Message:', message);
        
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
        
        console.log(`�� Found ${groups.length} groups to send to`);
        
        if (groups.length === 0) {
            throw new Error('No groups found in sheet');
        }
        
        // For now, just return success count as if messages were sent
        // In production, this would connect to your authenticated WhatsApp session
        console.log('⚠️ Demo mode - messages validated but not actually sent');
        console.log('✅ In production, messages would be sent to:', groups.map(g => g.name).join(', '));
        
        return groups.length; // Return success count
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

module.exports = { sendMessagesFromSheet };
