// register-reference.js
// Tabela de referência de registradores por controlador — para a aba "Controle
// Avançado (Modbus)" na tela de detalhe do gerador. Como o operador já está
// vendo os detalhes de um gerador específico, o controlador dele já é
// conhecido, então mostramos só a tabela relevante em vez de todos misturados.
//
// O campo `address` é o valor a digitar no campo "Endereço" da tela — é
// exatamente o `startAddress` que o backend usa para montar o pedido Modbus
// (não precisa converter nada). Quando o manual do fabricante numera o
// registrador de outro jeito (convenção Modicon 4xxxx, caso da Cummins), isso
// aparece só como nota entre parênteses, para conferência cruzada com o PDF.
//
// Fontes: os mesmos arquivos de parser/mapa já usados para decodificar cada
// controlador (dse4501-map.js + dse-parser.js, cummins-parser.js,
// sgc420-parser.js, sgc120-parser.js, kva-parser.js, agc150-parser.js),
// verificados ao vivo nesta mesma sessão de trabalho para DSE4501 e Cummins.
// Os demais refletem o que o código já documentava antes desta tabela existir.

const DSE4501 = [
    { address: 772, name: 'Modo de controle', unit: '-', access: 'LEITURA/ESCRITA', notes: '0/2/3=Manual, 1/4=Auto, 7=Inibido' },
    { address: 774, name: 'Flags de status', unit: 'bitmap', access: 'LEITURA', notes: 'Shutdown / trip elétrico / aviso / parada controlada' },
    { address: 1024, name: 'Pressão de óleo', unit: 'kPa (÷100→bar)', access: 'LEITURA' },
    { address: 1025, name: 'Temperatura do motor (arrefecimento)', unit: '°C', access: 'LEITURA' },
    { address: 1026, name: 'Temperatura do óleo', unit: '°C', access: 'LEITURA' },
    { address: 1027, name: 'Nível de combustível', unit: '%', access: 'LEITURA' },
    { address: 1029, name: 'Tensão de partida / bateria', unit: 'V (÷10)', access: 'LEITURA' },
    { address: 1030, name: 'Rotação do motor', unit: 'RPM', access: 'LEITURA' },
    { address: 1031, name: 'Frequência do gerador', unit: 'Hz (÷10)', access: 'LEITURA' },
    { address: 1032, name: 'Tensão gerador L1-N', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1034, name: 'Tensão gerador L2-N', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1036, name: 'Tensão gerador L3-N', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1038, name: 'Tensão gerador L1-L2', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1040, name: 'Tensão gerador L2-L3', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1042, name: 'Tensão gerador L3-L1', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1044, name: 'Corrente gerador L1', unit: 'A (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1046, name: 'Corrente gerador L2', unit: 'A (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1048, name: 'Corrente gerador L3', unit: 'A (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1052, name: 'Potência ativa L1', unit: 'W (2 regs)', access: 'LEITURA' },
    { address: 1054, name: 'Potência ativa L2', unit: 'W (2 regs)', access: 'LEITURA' },
    { address: 1056, name: 'Potência ativa L3', unit: 'W (2 regs)', access: 'LEITURA' },
    { address: 1058, name: 'Tensão rede L1-N', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1060, name: 'Tensão rede L2-N', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1062, name: 'Tensão rede L3-N', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1064, name: 'Tensão rede L1-L2', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1066, name: 'Tensão rede L2-L3', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1068, name: 'Tensão rede L3-L1', unit: 'V (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1072, name: 'Frequência da rede', unit: 'Hz (÷10)', access: 'LEITURA' },
    { address: 1408, name: 'Código de status (fabricante)', unit: '-', access: 'LEITURA', notes: '0=Parado, 1-2=Partindo, 3/8=Rodando, 4/9=Parando, 10=Alarme' },
    { address: 1536, name: 'Potência ativa total', unit: 'W (2 regs)', access: 'LEITURA' },
    { address: 1558, name: 'Carga do motor', unit: '% (÷10)', access: 'LEITURA' },
    { address: 1798, name: 'Horímetro', unit: 'segundos (2 regs)', access: 'LEITURA' },
    { address: 1800, name: 'Energia total gerada', unit: 'kWh (÷10, 2 regs)', access: 'LEITURA' },
    { address: 1808, name: 'Número de partidas do motor', unit: '- (2 regs)', access: 'LEITURA' },
    { address: 2048, name: 'Alarmes nomeados (contagem + condições)', unit: 'bitmap', access: 'LEITURA' },
    { address: 4104, name: 'Chave de comando (SCF)', unit: '-', access: 'ESCRITA', notes: 'Escreve a chave + complemento de 1 em 4105. STOP=35700, AUTO=35701, MANUAL=35702, TESTE_C/CARGA=35703, PARTIDA_MANUAL=35705, MUTE_ALARME=35706, RESET_ALARMES=35707, TELEMETRIA_START=35732/STOP=35733' },
];

const CUMMINS_PCC1301 = [
    { address: 9, name: 'Posição da chave do painel', unit: '-', access: 'LEITURA', notes: '0=Off, 1=Auto, 2=Manual (documentado como 40010)' },
    { address: 10, name: 'Estado do grupo gerador', unit: '-', access: 'LEITURA', notes: '0=Ready,1=Precrank,2=Ramp,3=Running (40011)' },
    { address: 11, name: 'Código de falha ativa', unit: '-', access: 'LEITURA', notes: '40012' },
    { address: 12, name: 'Tipo de falha ativa', unit: '-', access: 'LEITURA', notes: '0=Normal,1=Aviso,4=Shutdown (40013)' },
    { address: 15, name: 'Bitmap NFPA110', unit: 'bitmap', access: 'LEITURA', notes: 'bit14="Genset Supplying Load" = disjuntor do gerador fechado (40016)' },
    { address: 17, name: 'Tensão gerador L1-N', unit: 'V', access: 'LEITURA', notes: '40018' },
    { address: 18, name: 'Tensão gerador L2-N', unit: 'V', access: 'LEITURA', notes: '40019' },
    { address: 19, name: 'Tensão gerador L3-N', unit: 'V', access: 'LEITURA', notes: '40020' },
    { address: 25, name: 'Corrente gerador L1', unit: 'A (÷10)', access: 'LEITURA', notes: '40026' },
    { address: 26, name: 'Corrente gerador L2', unit: 'A (÷10)', access: 'LEITURA', notes: '40027' },
    { address: 27, name: 'Corrente gerador L3', unit: 'A (÷10)', access: 'LEITURA', notes: '40028' },
    { address: 28, name: 'Corrente média', unit: 'A (÷10)', access: 'LEITURA', notes: '40029' },
    { address: 39, name: 'Potência aparente total', unit: 'kVA', access: 'LEITURA', notes: 'Controlador só mede kVA, não kW (40043)' },
    { address: 43, name: 'Frequência do gerador', unit: 'Hz (÷10)', access: 'LEITURA', notes: '40044' },
    { address: 57, name: '% de carga fase L1', unit: '% (÷10)', access: 'LEITURA', notes: '40058' },
    { address: 58, name: '% de carga fase L2', unit: '% (÷10)', access: 'LEITURA', notes: '40059' },
    { address: 59, name: '% de carga fase L3', unit: '% (÷10)', access: 'LEITURA', notes: '40060' },
    { address: 60, name: 'Tensão da bateria', unit: 'V (÷10)', access: 'LEITURA', notes: '40061' },
    { address: 61, name: 'Pressão de óleo', unit: 'kPa', access: 'LEITURA', notes: '40062' },
    { address: 63, name: 'Temperatura do motor', unit: '°C (÷10)', access: 'LEITURA', notes: '40064' },
    { address: 67, name: 'Rotação do motor', unit: 'RPM', access: 'LEITURA', notes: '40068' },
    { address: 68, name: 'Número de partidas', unit: '-', access: 'LEITURA', notes: '"Total Runs" (40069)' },
    { address: 69, name: 'Horímetro', unit: 'segundos (2 regs)', access: 'LEITURA', notes: '40070-40071' },
    { address: 3744, name: 'Nível de combustível (módulo AUX101)', unit: 'sem escala confirmada', access: 'LEITURA', notes: '43745 — só funciona se o sender estiver ligado/configurado no AUX101' },
    { address: 299, name: 'Partida/Parada remota', unit: '-', access: 'ESCRITA', notes: '1=Partir, 0=Parar (documentado como 40300). Exige a chave do painel em Auto/Remoto' },
    { address: 300, name: 'Reset de falha', unit: '-', access: 'ESCRITA', notes: '1=Ativo, pulsado (40301)' },
];

const SGC420 = [
    { address: 1, name: 'Tensão/frequência do gerador', unit: 'V / Hz', access: 'LEITURA', notes: 'Bloco de 9 registradores a partir daqui' },
    { address: 14, name: 'Tensão/frequência da rede', unit: 'V / Hz', access: 'LEITURA', notes: 'Bloco de 9 registradores' },
    { address: 23, name: 'Corrente de carga L1/L2/L3', unit: 'A', access: 'LEITURA' },
    { address: 26, name: 'Potência (kW por fase + total + %)', unit: 'kW / %', access: 'LEITURA' },
    { address: 51, name: 'Motor (óleo, temp., combustível, bateria, rpm, partidas)', unit: 'diversos', access: 'LEITURA', notes: 'Bloco de 8 registradores' },
    { address: 61, name: 'Horímetro (horas + minutos)', unit: 'h/min', access: 'LEITURA' },
    { address: 72, name: 'Alarmes (16 grupos, GenComm)', unit: 'bitmap', access: 'LEITURA', notes: 'Bloco 72-85' },
    { address: 89, name: 'Entrada digital A', unit: '-', access: 'LEITURA' },
    { address: 91, name: 'Status do grupo gerador (DG status)', unit: 'bitmap', access: 'LEITURA', notes: 'bit "Load on Mains"(0x0200)/"Load on DG"(0x0400) — INVERTIDOS na prática em relação ao manual DEIF, conforme confirmado em campo' },
    { address: 0, name: 'Comando de modo/partida', unit: '-', access: 'ESCRITA', notes: '1=Parar/Manual, 2=Partir, 4=Automático, 64=Reset de alarme' },
];

const KVA = [
    { address: 12001, name: 'Horímetro (segundos, 2 regs) + falhas/avisos/status', unit: 'diversos', access: 'LEITURA', notes: 'Bloco de 7 registradores: 12001-12002 horímetro, 12003 falhas H, 12004 falhas L, 12005 avisos H, 12006 avisos L, 12007 status (modo/disjuntores/motor)' },
    { address: 12011, name: 'Elétrico: tensões L-L rede/gerador, frequências, correntes, potências, FP', unit: 'diversos', access: 'LEITURA', notes: 'Bloco de 15 registradores' },
    { address: 12027, name: 'Motor: rpm, temp., óleo, combustível, consumo, bateria', unit: 'diversos', access: 'LEITURA', notes: 'Bloco de 7 registradores' },
    { address: 12043, name: 'Tensões fase-neutro (rede e gerador)', unit: 'V', access: 'LEITURA', notes: 'Bloco de 6 registradores' },
    { address: 19108, name: 'Comando', unit: '-', access: 'ESCRITA', notes: '1=Auto, 2=Manual, 3=Inibido, 4=Limpa Falha, 5=Partida Manual, 6=Parada Manual, 7=Liga Chave Gerador, 8=Desliga Chave Gerador, 9=Liga Chave Rede, 10=Desliga Chave Rede' },
];

const AGC150 = [
    { address: 0, name: 'Disjuntores, modos, falha de rede', unit: 'bitmap (fn 02, discreto)', access: 'LEITURA', notes: 'Bloco de 32 entradas discretas (0-31): GB/MB fechado, modo, rodando, falha de rede' },
    { address: 501, name: 'Elétrico Bus A', unit: 'diversos (fn 04)', access: 'LEITURA', notes: 'Bloco de 38 registradores' },
    { address: 539, name: 'Elétrico Bus B', unit: 'diversos (fn 04)', access: 'LEITURA', notes: 'Bloco de 13 registradores' },
    { address: 554, name: 'Horímetro, alarmes, partidas, alimentação DC', unit: 'diversos (fn 04)', access: 'LEITURA', notes: 'Bloco de 14 registradores' },
    { address: 576, name: 'Medições do motor', unit: 'diversos (fn 04)', access: 'LEITURA', notes: 'Bloco de 45 registradores' },
    { address: 0, name: 'Partida remota', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 1, name: 'Fechar disjuntor do gerador (GB)', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 2, name: 'Abrir disjuntor do gerador (GB)', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 3, name: 'Parada remota', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 9, name: 'Reconhecer alarme', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 14, name: 'Partida síncrona (modo manual)', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 15, name: 'Parada com descarga (modo manual)', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 24, name: 'Fechar disjuntor da rede (MB)', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 25, name: 'Abrir disjuntor da rede (MB)', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 28, name: 'Modo Manual', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 29, name: 'Modo Automático', unit: 'coil (fn 05)', access: 'ESCRITA' },
    { address: 30, name: 'Modo Teste', unit: 'coil (fn 05)', access: 'ESCRITA' },
];

const SGC120 = [
    { address: 0, name: 'Comando de modo/partida', unit: '-', access: 'ESCRITA', notes: '1=Parar/Manual, 2=Partir, 4=Automático, 64=Reset de alarme' },
    { address: 1, name: 'Tensão/frequência do gerador', unit: 'V / Hz', access: 'LEITURA', notes: 'Bloco de 9 registradores' },
    { address: 14, name: 'Tensão/frequência da rede', unit: 'V / Hz', access: 'LEITURA', notes: 'Bloco de 9 registradores' },
    { address: 16, name: 'Registrador de status/descoberta', unit: '-', access: 'LEITURA' },
    { address: 23, name: 'Corrente de carga (única CT — vale para o lado com disjuntor fechado)', unit: 'A', access: 'LEITURA', notes: 'Controlador com um único sensor de corrente, não um por disjuntor' },
    { address: 29, name: 'Potência ativa por fase + total', unit: 'kW', access: 'LEITURA' },
    { address: 51, name: 'Motor (óleo, temp., combustível, bateria, rpm)', unit: 'diversos', access: 'LEITURA', notes: 'Bloco de 11 registradores, inclui horímetro em 60/61' },
    { address: 65, name: 'Alarmes completos', unit: 'bitmap', access: 'LEITURA', notes: 'Bloco de 12 registradores — fonte única da verdade para estado de alarme' },
    { address: 77, name: 'Entradas digitais + modo (combinado)', unit: 'bitmap', access: 'LEITURA', notes: 'bit15=disjuntor gerador, bit14=disjuntor rede (confirmado em campo)' },
];

const REGISTER_REFERENCE = {
    dse: DSE4501,
    cummins: CUMMINS_PCC1301,
    sgc420: SGC420,
    kva: KVA,
    kvar: KVA,
    agc150: AGC150,
    sgc120: SGC120,
};

/** Retorna a tabela de referência para o controlador informado, ou [] se desconhecido/sem tabela ainda. */
export function getRegisterReference(controller) {
    const key = (controller || '').toLowerCase();
    return REGISTER_REFERENCE[key] || [];
}
