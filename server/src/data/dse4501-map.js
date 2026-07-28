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
//              MAS isso não torna a troca de modo segura. O próprio GenComm.pdf
//              (seção "Page 16 - Control Registers", nota 6) documenta:
//              "Function codes 0 to 31 perform exactly the same function as
//              pressing the equivalent button on the control unit." Ou seja,
//              mandar a chave MANUAL por Modbus é idêntico a apertar o botão
//              físico Manual no painel — e foi exatamente isso que, no Ciklo55,
//              deu partida no motor (ver aviso em DSE_CONTROL_KEYS). A causa não
//              é o valor do registrador; é uma condição/config do próprio gerador
//              (DSE Configuration Suite, ou uma entrada de partida remota travada
//              nos terminais) que faz o botão físico Manual também partir o motor
//              nesse aparelho específico. Isso só se resolve fisicamente no painel
//              — não tem ajuste de software que resolva.

export const DSE4501_MODEL = 'DSE4501';

/** GenComm Page 3 offset 4 — control mode (also exported as /AutoStart in dse_registers.json) */
export const DSE_REG_CONTROL_MODE = 772;

/** GenComm Page 3 offset 6 — status flags (shutdown/warning/trip active) */
export const DSE_REG_STATUS_FLAGS = 774;

/** GenComm Page 8 offset 0 — alarm count + named alarm conditions */
export const DSE_REG_ALARMS = 2048;

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
    { startAddress: 2048, quantity: 8 },  // Page 8: alarm count + conditions
];
