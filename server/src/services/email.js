import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'vultrplesk1.agencianet.net.br',
    port: 587,
    secure: false, // true for 465, false for other ports (587)
    requireTLS: true,
    auth: {
        user: 'alarme@ciklogeradores.com.br',
        pass: 'pfD6#x87'
    },
    tls: {
        rejectUnauthorized: false // Helps avoid some self-signed cert issues if present
    }
});

export const sendAlarmEmail = async (toEmails, generatorId, generatorName, alarmDetails) => {
    if (!toEmails || toEmails.length === 0) {
        console.log('[EMAIL] No recipients provided for alarm notification.');
        return;
    }

    const mailOptions = {
        from: '"Ciklo Geradores Alarmes" <alarme@ciklogeradores.com.br>',
        to: toEmails.join(','), // CSV string of emails
        subject: `🚨 ALARME GERADOR ${generatorName}: ${alarmDetails.description || 'Falha Detectada'}`,
        html: `
            <div style="font-family: Arial, sans-serif; background-color: #1a1a1a; color: #ffffff; padding: 20px; border-radius: 8px; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #ff4444; border-bottom: 2px solid #ff4444; padding-bottom: 10px;">Aviso de Alarme</h2>
                <p>O gerador <strong>${generatorName}</strong> reportou uma nova condição de alarme.</p>
                <div style="background-color: #2d2d2d; padding: 15px; border-left: 4px solid #ff4444; margin: 20px 0;">
                    <p style="margin: 5px 0; font-size: 18px;"><strong>⚠️ ${alarmDetails.description}</strong></p>
                    <p style="margin: 5px 0; color: #aaaaaa;"><strong>Código de Falha:</strong> ${alarmDetails.code}</p>
                    <p style="margin: 5px 0;"><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                </div>
                <p style="color: #cccccc; font-size: 12px; margin-top: 30px; text-align: center;">
                    Este é um e-mail automático do sistema Ciklo Geradores. Por favor não responda.
                </p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Alarm notification sent to ${mailOptions.to}. Message ID: ${info.messageId}`);
    } catch (error) {
        console.error('[EMAIL] Failed to send alarm notification:', error);
    }
};
