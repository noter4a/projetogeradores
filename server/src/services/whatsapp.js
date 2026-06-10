import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

let twilioClient = null;
if (accountSid && authToken) {
    twilioClient = twilio(accountSid, authToken);
} else {
    console.warn('[WHATSAPP] ⚠️ TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set. WhatsApp notifications disabled.');
}

/**
 * Sends a WhatsApp alarm notification using the Twilio Content Template API.
 * @param {string} phone - Phone number with country code (e.g. 5554999999999)
 * @param {string} generatorName - Name of the generator
 * @param {string} alarmMessage - Description of the alarm
 * @param {string} status - Alarm status (e.g. 'ATIVO')
 */
export const sendAlarmWhatsApp = async (phone, generatorName, alarmMessage, status) => {
    if (!twilioClient) {
        console.warn('[WHATSAPP] Twilio client not initialized. Skipping WhatsApp alarm notification.');
        return;
    }

    const from = process.env.TWILIO_WHATSAPP_FROM;
    const contentSid = process.env.TWILIO_CONTENT_SID;

    if (!from || !contentSid) {
        console.warn('[WHATSAPP] ⚠️ TWILIO_WHATSAPP_FROM or TWILIO_CONTENT_SID not set. Skipping.');
        return;
    }

    const dateTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Ensure phone has country code 55 (Brazil)
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;

    try {
        const message = await twilioClient.messages.create({
            from: `whatsapp:${from}`,
            to: `whatsapp:+${fullPhone}`,
            contentSid: contentSid,
            contentVariables: JSON.stringify({
                1: generatorName,
                2: dateTime,
                3: alarmMessage,
                4: status
            })
        });
        console.log(`[WHATSAPP] ✅ Alarm message sent to +${fullPhone} (SID: ${message.sid})`);
    } catch (err) {
        console.error(`[WHATSAPP] ❌ Failed to send alarm to +${fullPhone}:`, err.message);
    }
};

/**
 * Sends a WhatsApp alarm resolved notification using the same Content Template.
 * Uses status 'RESOLVIDO' to indicate the alarm has been cleared.
 * @param {string} phone - Phone number with country code (e.g. 5554999999999)
 * @param {string} generatorName - Name of the generator
 */
export const sendAlarmResolvedWhatsApp = async (phone, generatorName) => {
    if (!twilioClient) {
        console.warn('[WHATSAPP] Twilio client not initialized. Skipping WhatsApp resolved notification.');
        return;
    }

    const from = process.env.TWILIO_WHATSAPP_FROM;
    const contentSid = process.env.TWILIO_CONTENT_SID;

    if (!from || !contentSid) {
        console.warn('[WHATSAPP] ⚠️ TWILIO_WHATSAPP_FROM or TWILIO_CONTENT_SID not set. Skipping.');
        return;
    }

    const dateTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Ensure phone has country code 55 (Brazil)
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;

    try {
        const message = await twilioClient.messages.create({
            from: `whatsapp:${from}`,
            to: `whatsapp:+${fullPhone}`,
            contentSid: contentSid,
            contentVariables: JSON.stringify({
                1: generatorName,
                2: dateTime,
                3: 'Alarmes normalizados',
                4: 'RESOLVIDO'
            })
        });
        console.log(`[WHATSAPP] ✅ Resolved message sent to +${fullPhone} (SID: ${message.sid})`);
    } catch (err) {
        console.error(`[WHATSAPP] ❌ Failed to send resolved to +${fullPhone}:`, err.message);
    }
};
