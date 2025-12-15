// Simulação de Tratamento de Dados do Gerador
// Cenário: O Gerador retorna uma string "ASCII" (bytes) que precisamos converter e ler.

// 1. Simulação da Resposta do Gerador (Buffer de dados recebido via socket)
// Vamos supor que recebemos esses caracteres estranhos que representam valores
// Exemplo: 'Z' (90), 'd' (100 in hex? no, 'd' is 100 decimal), etc.
// Vamos usar um Buffer real para simular o que vem da rede.

// Simulando uma resposta com 8 bytes (ex: Voltagem, Temperatura, Nível Combustivel, Status)
const rawResponse = Buffer.from([
    0x0E, // 14 (ex: Status simples)
    0xE6, // 230 (ex: Voltagem 230V)
    0x50, // 80 (ex: Temperatura 80 graus)
    0x64, // 100 (ex: Nível 100%)
    0x00, 0x01, // 1 (ex: Algum flag)
    0xFF, // 255 (ex: Erro ou check)
    0x41  // 65 ('A' em ASCII)
]);

console.log('--- 1. RECEBIDO DO GERADOR (BUFFER/ASCII) ---');
console.log('Raw Buffer:', rawResponse);
console.log('Como Texto (ASCII):', rawResponse.toString('ascii'));
console.log('(Note que como texto fica "sujo" porque são bytes de controle ou estendidos)\n');

// 2. Convertendo para HEXADECIMAL (Para visualização técnica)
const hexString = rawResponse.toString('hex').toUpperCase();

console.log('--- 2. CONVERTIDO PARA HEX (Técnico) ---');
// Adiciona espaços para facilitar leitura: "0E E6 50..."
const formattedHex = hexString.match(/.{1,2}/g).join(' ');
console.log('HEX String:', formattedHex);
console.log('\n');

// 3. INTERPRETANDO OS DADOS (JSON para o Frontend)
// Aqui a gente aplica a "regra de negócio" do manual do gerador.
// Vamos inventar uma regra aqui para teste.

const dadosInterpretados = {
    status_code: rawResponse[0],           // Byte 0: Leitura direta
    voltagem_saida: rawResponse[1],        // Byte 1: 0xE6 = 230 Volts
    temperatura_motor: rawResponse[2],     // Byte 2: 0x50 = 80 Graus
    nivel_combustivel: rawResponse[3],     // Byte 3: 0x64 = 100%
    flags_avancadas: rawResponse.readUInt16BE(4), // Bytes 4 e 5: 0x0001 = 1
    checksum: rawResponse[6],              // Byte 6
    modelo_char: String.fromCharCode(rawResponse[7]) // Byte 7: 0x41 = 'A'
};

console.log('--- 3. DADOS TRATADOS (JSON para o Site) ---');
console.log(JSON.stringify(dadosInterpretados, null, 2));

console.log('\n--- CONCLUSÃO ---');
console.log('O site vai receber apenas o JSON acima e mostrar:');
console.log(`> Voltagem: ${dadosInterpretados.voltagem_saida} V`);
console.log(`> Temperatura: ${dadosInterpretados.temperatura_motor} °C`);
