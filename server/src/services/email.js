import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'vultrplesk1.agencianet.net.br',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

/**
 * Envia um código OTP (6 dígitos) por e-mail. Usado tanto para 2FA no login
 * quanto para redefinição de senha ("esqueci minha senha"). Lança em caso de
 * falha para o chamador saber que o e-mail não saiu.
 */
export const sendOtpEmail = async (toEmail, code, purpose) => {
    const isReset = purpose === 'password_reset';
    const title = isReset ? 'Redefinição de senha' : 'Código de acesso';
    const intro = isReset
        ? 'Recebemos um pedido para redefinir a senha da sua conta. Use o código abaixo para continuar.'
        : 'Use o código abaixo para concluir o seu login.';

    const mailOptions = {
        from: '"Ciklo Geradores" <alarme@ciklogeradores.com.br>',
        to: toEmail,
        subject: `${isReset ? '🔑' : '🔒'} ${title} — código ${code}`,
        html: `
            <div style="font-family: Arial, sans-serif; background-color: #1a1a1a; color: #ffffff; padding: 20px; border-radius: 8px; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #f97316; border-bottom: 2px solid #f97316; padding-bottom: 10px;">${title}</h2>
                <p>${intro}</p>
                <div style="background-color: #2d2d2d; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <span style="font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #ffce00;">${code}</span>
                </div>
                <p style="color: #aaaaaa;">O código expira em <strong>10 minutos</strong>. Se você não solicitou, ignore este e-mail — sua conta segue segura.</p>
                <p style="color: #cccccc; font-size: 12px; margin-top: 30px; text-align: center;">
                    Este é um e-mail automático do sistema Ciklo Geradores. Por favor não responda.
                </p>
            </div>
        `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] OTP (${purpose}) enviado para ${toEmail}. Message ID: ${info.messageId}`);
    return info;
};

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
