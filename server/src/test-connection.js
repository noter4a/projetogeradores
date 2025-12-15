
import net from 'net';

// CONFIGURAÇÃO (PREENCHER AQUI OU PASSAR VIA ARGUMENTOS)
const HOST = process.argv[2] || '127.0.0.1'; // IP do Device/Simulador
const PORT = process.argv[3] || 502;         // Porta (Padrão Modbus é 502, mas pode ser outra)

// OS COMANDOS HEX QUE VOCÊ RECEBEU
// Frame 1: Leitura de 60 registradores a partir do 0
// Frame 2: Leitura de 1 registrador a partir do 1018 (03FA)
const COMMANDS = [
    Buffer.from('01040000003CF01B', 'hex'),
    Buffer.from('010403FA000111BF', 'hex')
];

console.log(`\n--- INICIANDO TESTE DE CONEXÃO ---`);
console.log(`Alvo: ${HOST}:${PORT}`);
console.log(`Comandos para enviar: ${COMMANDS.length}`);

const client = new net.Socket();

client.connect(PORT, HOST, () => {
    console.log('>>> CONECTADO COM SUCESSO!');

    // Enviar o primeiro comando
    sendNextCommand(0);
});

function sendNextCommand(index) {
    if (index >= COMMANDS.length) {
        console.log('--- TODOS OS COMANDOS ENVIADOS ---');
        client.destroy();
        return;
    }

    const cmd = COMMANDS[index];
    console.log(`\n[${index + 1}] Enviando HEX: ${cmd.toString('hex').toUpperCase()}`);
    client.write(cmd);
}

client.on('data', (data) => {
    console.log(`    <<< RESPOSTA RECEBIDA (HEX): ${data.toString('hex').toUpperCase()}`);
    console.log(`    <<< RESPOSTA RECEBIDA (ASCII): ${data.toString('ascii')}`);

    // Simplesmente avança pro próximo comando após receber resposta
    // (Em produção precisaria validar se é o pacote completo)
    setTimeout(() => {
        // Envia o próximo comando da lista (se houver)
        // Precisamos saber qual comando da lista estamos processando.
        // Para esse teste simples, usaremos um contador global ou apenas fecharemos.

        // CORREÇÃO LÓGICA: O 'sendNextCommand' foi chamado com 0.
        // Como 'on data' não tem o índice, vamos assumir sequencial simples para teste.
        // Vamos enviar o segundo comando agora se o anterior foi o primeiro.

        // Hack rápido para teste: vamos ver o tamanho da resposta
        // Se response grande, deve ser a do comando 1 (60 regs).

        if (data.length > 20) {
            console.log('    (Parece ser a resposta dos 60 registradores)');
            sendNextCommand(1); // Manda o segundo
        } else {
            console.log('    (Parece ser a resposta curta)');
            client.destroy(); // Encerra
        }

    }, 1000);
});

client.on('close', () => {
    console.log('\n>>> CONEXÃO FECHADA');
});

client.on('error', (err) => {
    console.error(`!!! ERRO DE CONEXÃO: ${err.message}`);
    console.log('Dica: Verifique se o IP e a PORTA estão corretos.');
});
