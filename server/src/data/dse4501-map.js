// DSE4501 / GenComm Modbus register map
//
// PROCEDÊNCIA:
//
//   LEITURA  — os registradores de leitura (772, 1024-1073, 1408, 1536, 1558,
//              1798-1809, 2048...) vêm de dse_registers.json, na raiz do projeto,
//              e conferem com o que o equipamento devolve em campo. Confiáveis.
//
//   ESCRITA  — as DSE_CONTROL_KEYS abaixo foram checadas em 2026-07-28 contra o
//              GenComm.pdf (Deep Sea Electronics, "GenComm standard for use with
//              generating set control equipment", v2.267, o protocolo oficial —
//              não é específico de um modelo, cobre toda a família DSE Gencomm) e
//              contra 056-051_Gencomm_Control_Keys.pdf. Os valores batem exatamente
//              com os dois documentos: 35700=Stop, 35701=Auto, 35702=Manual,
//              35703=Test on load, 35705=Start manual, 35706=Mute, 35707=Reset
//              alarms, 35732=Telemetry start, 35733=Cancel telemetry start.
//              Não foram chutados — sempre estiveram certos.
//
//              E a troca pra Manual DAR PARTIDA NÃO É BUG NEM CONFIGURAÇÃO DO
//              GERADOR — é a própria definição do modo no GenComm.pdf (seção
//              "Page 3 - Generating Set Status Information", notas sobre
//              "Control modes"): "'Manual mode' means start the engine
//              (generator). With some control units it will also be necessary
//              to press the start button before such a manual start is
//              initiated." Ou seja: em parte dos controladores GenComm, entrar
//              em Manual JÁ dá partida sozinho, sem precisar de start separado
//              — é exatamente o que este DSE4501 faz. 'Auto mode' é diferente:
//              só dá partida com sinal de remote-start ou falha de rede (não
//              ao simplesmente selecionar o modo). Não tem ajuste de registrador
//              que mude isso — é o comportamento definido do modo Manual em si.
//
//              2026-07-28 (2ª decisão): por isso o botão "Manual" do app NÃO
//              manda mais a chave MANUAL (35702) — manda STOP (35700) no lugar,
//              a pedido do usuário, pra servir de trava contra partida automática
//              por falha de rede sem partir sozinho ao selecionar (Stop mode não
//              responde a falha de rede). Ver switch/case completo em mqtt.js.
//              MANUAL (35702) continua correta e documentada aqui, só não é mais
//              alcançável por nenhum botão da UI. Tradeoff aceito: START_MANUAL
//              (35705) nunca foi testado partindo de Stop mode de verdade — pode
//              não ter efeito nenhum (a própria chave diz "if in manual or test
//              modes"). Se isso acontecer, só dá pra ligar remotamente mandando
//              a chave MANUAL real — que aí sim parte na hora.

export const DSE4501_MODEL = 'DSE4501';

/** GenComm Page 3 offset 4 — control mode (also exported as /AutoStart in dse_registers.json) */
export const DSE_REG_CONTROL_MODE = 772;

/** GenComm Page 3 offset 6 — status flags (shutdown/warning/trip active) */
export const DSE_REG_STATUS_FLAGS = 774;

/** GenComm Page 8 offset 0 — alarm count + named alarm conditions */
export const DSE_REG_ALARMS = 2048;

/**
 * GenComm Page 13 offset 0 (13*256=3328) — "Diagnostic - Digital Outputs".
 * Confirmado em 2026-07-28 contra GenComm.pdf: um único registrador packed em
 * campos de 2 bits (código 0=De-energised, 1=Energised, 2=Reserved,
 * 3=Unimplemented) — bits 15-16 Fuel relay, 13-14 Start relay, 11-12 Mains
 * loading relay, 9-10 Generator loading relay, 7-8 Modem power relay.
 * Antes desta correção, mainsBreakerClosed/genBreakerClosed nunca eram lidos
 * do DSE — ficavam travados no default (false = "aberta") pra sempre,
 * independente do estado real do contator. Ver decodeDseByBlock/DSE_RELAYS_3328
 * em dse-parser.js.
 */
export const DSE_REG_RELAYS = 3328;

/** GenComm Page 16 offset 8 — system control key (written with one's complement at +1) */
export const DSE_REG_SCF = 4104;

/**
 * ✅ Valores conferidos contra GenComm.pdf e 056-051_Gencomm_Control_Keys.pdf
 * (2026-07-28) — batem exatamente. Não são chute.
 *
 * ⚠️ MAS AUTO e MANUAL continuam BLOQUEADOS em mqtt.js. Comprovado em campo
 * (Ciklo55): enviar MANUAL (35702) com a rede sadia (382-384 V) e o controlador
 * em AUTO (reg 772 = 1) trocou o modo corretamente (reg 772 passou a 2) MAS
 * TAMBÉM DEU PARTIDA no motor (rpm 0 -> 1032 -> 1802, RUNNING) — sendo esse o
 * único comando enviado, nenhum start.
 *
 * O GenComm.pdf documenta (Page 16, nota 6) que os function codes 0-31 fazem
 * "exactly the same function as pressing the equivalent button on the control
 * unit" — ou seja, essa chave equivale a apertar o botão físico Manual no
 * painel. A causa da partida não é o valor do registrador (que está correto);
 * é uma configuração/condição do próprio DSE4501 nesse gerador específico
 * (DSE Configuration Suite, ou uma entrada de partida remota travada nos
 * terminais). Só reabilite depois de checar isso fisicamente no painel —
 * mudar o número aqui não resolve, porque o número já está certo.
 *
 * Verificado ao vivo e funcionando: TELEMETRY_STOP (parada com o cooldown
 * normal do DSE, 1802 rpm -> 44 -> parado).
 * Nunca exercitados/validados em campo (valor confere com a doc, mas o
 * comportamento real no equipamento não foi testado): TEST_ON_LOAD,
 * MUTE_ALARM, TELEMETRY_START.
 */
export const DSE_CONTROL_KEYS = {
    STOP: 35700,
    AUTO: 35701,            // valor correto — BLOQUEADO em mqtt.js (ver acima)
    MANUAL: 35702,           // valor correto — dá partida no motor. BLOQUEADO.
    TEST_ON_LOAD: 35703,     // valor correto, nunca usado pela UI
    START_MANUAL: 35705,
    MUTE_ALARM: 35706,       // valor correto, nunca usado pela UI
    RESET_ALARMS: 35707,
    TELEMETRY_START: 35732,
    TELEMETRY_STOP: 35733,   // verificado ao vivo: para o motor corretamente
};

/** GenComm control mode values (register 772) */
export const DSE_CONTROL_MODE = {
    0: 'MANUAL',   // Stop mode — UI treats as manual (no auto-start)
    1: 'AUTO',
    2: 'MANUAL',
    3: 'MANUAL',   // Test on load
    4: 'AUTO',     // Auto with manual restore
    7: 'INHIBITED' // Off mode
};

/** StatusCode register 1408 — DSE4501 / GenComm state machine values */
export const DSE_STATUS_CODE = {
    0: 'STOPPED',
    1: 'STARTING',
    2: 'STARTING',
    3: 'RUNNING',
    4: 'STOPPING',
    8: 'RUNNING',
    9: 'STOPPING',
    10: 'ALARM',
};

/** GenComm Page 8 named alarms (4 per register, packed as 4-bit nibbles) */
export const DSE_NAMED_ALARMS = [
    'Emergency stop',
    'Low oil pressure',
    'High coolant temperature',
    'High oil temperature',
    'Under speed',
    'Over speed',
    'Fail to start',
    'Fail to come to rest',
    'Loss of speed sensing',
    'Generator low voltage',
    'Generator high voltage',
    'Generator low frequency',
    'Generator high frequency',
    'Generator high current',
    'Generator earth fault',
    'Generator reverse power',
    'Air flap',
    'Oil pressure sender fault',
    'Coolant temperature sender fault',
    'Oil temperature sender fault',
    'Fuel level sender fault',
    'Magnetic pickup fault',
    'Loss of AC speed signal',
    'Charge alternator failure',
    'Low battery voltage',
    'High battery voltage',
    'Low fuel level',
    'High fuel level',
    'Generator failed to close',
    'Mains failed to close',
    'Generator failed to open',
    'Mains failed to open',
    // Indices 32-43: GenComm.pdf pág. 67 (continuação da tabela de página 66 acima).
    // 'Mains failed' (índice 38) é o alarme nativo de falha de rede do próprio
    // DSE — considera a janela de tensão/frequência com debounce interno do
    // controlador, ao contrário da heurística de "todas as fases < 10V" usada
    // em mqtt.js, que só detecta quedas completas e demora a reagir a quedas
    // parciais. Índices em branco no manual (39, 41, 43) ficam com nome
    // genérico só por completude — a condição deles vem sempre como 15
    // (unimplemented) então decodeAlarmNibble nunca os deixa passar.
    'Mains low voltage',
    'Mains high voltage',
    'Bus failed to close',
    'Bus failed to open',
    'Mains low frequency',
    'Mains high frequency',
    'Mains failed',
    'Reserved',
    'Mains phase rotation wrong',
    'Reserved',
    'Generator phase rotation wrong',
    'Reserved',
];

/** GenComm alarm condition nibble values */
export const DSE_ALARM_CONDITION = {
    0: 'disabled',
    1: 'not_active',
    2: 'warning',
    3: 'shutdown',
    4: 'electrical_trip',
    5: 'controlled_shutdown',
    15: 'unimplemented',
};

/** Poll blocks for DSE4501 over DR164 transparent Modbus */
export const DSE4501_POLL_SEQUENCE = [
    { startAddress: 1024, quantity: 14 }, // Page 4: engine + gen L-N
    { startAddress: 1038, quantity: 14 }, // Page 4: gen L-L + currents
    { startAddress: 1052, quantity: 6 },  // Page 4: per-phase power
    { startAddress: 1058, quantity: 15 }, // Page 4: mains voltages + freq
    { startAddress: 772, quantity: 1 },   // Page 3: control mode
    { startAddress: 774, quantity: 1 },   // Page 3: status/alarm flags
    { startAddress: 1536, quantity: 2 },  // Page 6: total active power
    { startAddress: 1558, quantity: 1 },  // Page 6: engine load
    // Page 7: operating hours (1798-1799) + total energy (1800-1801, /Ac/Energy/
    // Forward) + engine starts (1808-1809, /Engine/Starts) in one read — widened
    // from the original 2-register read since 1798-1809 is contiguous, so this
    // costs zero extra round-trips on a link that's already timeout-prone.
    { startAddress: 1798, quantity: 12 },
    { startAddress: 1408, quantity: 1 },  // StatusCode (manufacturer)
    // Page 8: alarm count + conditions. Widened de 8 pra 12 registradores pra
    // alcançar o registrador 2058 (índice de alarme 38 = 'Mains failed', o
    // alarme nativo de falha de rede do DSE — ver DSE_NAMED_ALARMS acima).
    { startAddress: 2048, quantity: 12 },
    { startAddress: 3328, quantity: 1 },  // Page 13: mains/generator loading relay (breaker status)
];
