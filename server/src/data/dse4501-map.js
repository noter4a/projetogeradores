// DSE4501 / GenComm Modbus register map
// Based on dse_registers.json, GenComm standard (Page 3/4/8/16) and DSE4501 compact controller.

export const DSE4501_MODEL = 'DSE4501';

/** GenComm Page 3 offset 4 — control mode (also exported as /AutoStart in dse_registers.json) */
export const DSE_REG_CONTROL_MODE = 772;

/** GenComm Page 3 offset 6 — status flags (shutdown/warning/trip active) */
export const DSE_REG_STATUS_FLAGS = 774;

/** GenComm Page 8 offset 0 — alarm count + named alarm conditions */
export const DSE_REG_ALARMS = 2048;

/** GenComm Page 16 offset 8 — system control key (written with one's complement at +1) */
export const DSE_REG_SCF = 4104;

export const DSE_CONTROL_KEYS = {
    STOP: 35700,
    AUTO: 35701,
    MANUAL: 35702,
    TEST_ON_LOAD: 35703,
    START_MANUAL: 35705,
    MUTE_ALARM: 35706,
    RESET_ALARMS: 35707,
    TELEMETRY_START: 35732,
    TELEMETRY_STOP: 35733,
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
    { startAddress: 1798, quantity: 2 },  // Page 7: operating hours (seconds)
    { startAddress: 1408, quantity: 1 },  // StatusCode (manufacturer)
    { startAddress: 2048, quantity: 8 },  // Page 8: alarm count + conditions
];
