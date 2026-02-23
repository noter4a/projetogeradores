import { sendAlarmEmail } from './services/email.js';

const targetEmail = process.argv[2];

if (!targetEmail) {
    console.error('❌ Por favor, informe um e-mail de destino.');
    console.log('Exemplo: node src/test_email.js seunome@email.com');
    process.exit(1);
}

console.log(`⏳ Enviando e-mail de teste para: ${targetEmail}...`);

const dummyAlarm = {
    code: 'TESTE-001',
    description: 'Este é um e-mail de teste do sistema Ciklo Geradores para validar as configurações SMTP.'
};

async function runTest() {
    try {
        await sendAlarmEmail([targetEmail], 'GERADOR-TESTE', dummyAlarm);
        console.log('✅ Comando de envio finalizado. Verifique a caixa de entrada (e a caixa de spam) do e-mail de destino.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erro durante o teste:', err);
        process.exit(1);
    }
}

runTest();
