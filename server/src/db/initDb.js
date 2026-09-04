import bcrypt from 'bcryptjs';
import pool from '../db.js';

// Initialize Database Tables with Retry
const initDb = async (retries = 15, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const client = await pool.connect();

            // Create Companies Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS companies (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Migration: Add credit system columns to companies
            try {
                await client.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 30");
                await client.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_credit_debit_date DATE NOT NULL DEFAULT CURRENT_DATE");
            } catch (e) {
                console.log("Migration companies.credits already applied or failed:", e.message);
            }

            // Migration: quais Avisos (severidade separada de Falha) a empresa quer
            // receber — opt-in por padrão (nada ativo até a empresa configurar em
            // Configurações de Avisos), EXCETO os dois itens que já disparavam ALARME
            // de verdade antes dessa feature existir ("DSE:Aviso Genérico" e
            // "CUMMINS:Aviso Genérico" — warningAlarmActive do DSE e faultType=1 do
            // Cummins viravam alarmCode antes de serem reclassificados pro canal de
            // Aviso). Esses dois vêm pré-marcados pra ninguém perder a visibilidade
            // que já tinha; todo o resto (KVA e os ~86 itens do SGC120/420) é
            // visibilidade nova e continua desmarcado. Vale tanto pra empresa já
            // existente (o DEFAULT se aplica às linhas atuais numa coluna nova) quanto
            // pra empresa criada depois (o INSERT em routes/companies.js não passa
            // enabled_warnings, então cai no DEFAULT também).
            try {
                await client.query(
                    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_warnings JSONB NOT NULL
                     DEFAULT '["DSE:Aviso Genérico", "CUMMINS:Aviso Genérico"]'::jsonb`
                );
            } catch (e) {
                console.log("Migration companies.enabled_warnings already applied or failed:", e.message);
            }

            // Create Users Table
            await client.query(`
              CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                assigned_generators TEXT[],
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                company_id INT REFERENCES companies(id) ON DELETE SET NULL
              );
            `);

            // Migration: Add company_id to users if table already existed without it
            try {
                await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL");
            } catch (e) {
                console.log("Migration users.company_id already applied or failed:", e.message);
            }

            // Migration: Add phone, whatsapp_alerts and email_alerts to users
            try {
                await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)");
                await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_alerts BOOLEAN DEFAULT false");
                await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_alerts BOOLEAN DEFAULT true");
                await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false");
            } catch (e) {
                console.log("Migration users.phone/whatsapp_alerts/email_alerts/two_factor already applied or failed:", e.message);
            }

            // Check if admin exists, if not seed default users
            const adminCheck = await client.query("SELECT * FROM users WHERE email = 'admin@ciklo.com'");
            if (adminCheck.rows.length === 0) {
                console.log('Seeding default users...');

                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash('123456', salt);

                // Admin
                await client.query(
                    "INSERT INTO users (name, email, password, role, assigned_generators, company_id) VALUES ($1, $2, $3, $4, $5, $6)",
                    ['Administrador Ciklo', 'admin@ciklo.com', hashedPassword, 'ADMIN', [], null]
                );

                // Technician
                await client.query(
                    "INSERT INTO users (name, email, password, role, assigned_generators, company_id) VALUES ($1, $2, $3, $4, $5, $6)",
                    ['Técnico Operacional', 'tech@ciklo.com', hashedPassword, 'TECHNICIAN', ['GEN-001', 'GEN-003'], null]
                );

                // Client
                await client.query(
                    "INSERT INTO users (name, email, password, role, assigned_generators, company_id) VALUES ($1, $2, $3, $4, $5, $6)",
                    ['Cliente Final', 'client@company.com', hashedPassword, 'CLIENT', ['GEN-002'], null]
                );

                console.log('Default users created.');
            }

            // Create Generators Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS generators (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255),
                    location TEXT,
                    model VARCHAR(255),
                    power_kva NUMERIC,
                    status VARCHAR(50),
                    connection_info JSONB,
                    last_seen TIMESTAMP,

                    voltage_l1 NUMERIC, voltage_l2 NUMERIC, voltage_l3 NUMERIC,
                    current_l1 NUMERIC, current_l2 NUMERIC, current_l3 NUMERIC,
                    frequency NUMERIC,

                    mains_voltage_l1 NUMERIC, mains_voltage_l2 NUMERIC, mains_voltage_l3 NUMERIC,
                    mains_frequency NUMERIC,

                    oil_pressure NUMERIC, engine_temp NUMERIC, fuel_level NUMERIC,
                    rpm NUMERIC, battery_voltage NUMERIC,

                    run_hours NUMERIC, total_hours NUMERIC,
                    active_power NUMERIC, power_factor NUMERIC,

                    voltage_l12 NUMERIC, voltage_l23 NUMERIC, voltage_l31 NUMERIC,
                    company_id INT REFERENCES companies(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Migration: Add company_id and created_at to generators if table already existed without them
            try {
                await client.query("ALTER TABLE generators ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL");
                await client.query("ALTER TABLE generators ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
                await client.query("ALTER TABLE generators ADD COLUMN IF NOT EXISTS last_connected TIMESTAMP");
            } catch (e) {
                console.log("Migration generators.company_id already applied or failed:", e.message);
            }

            // Create Alarm History Table (Moved from db.js for safety)
            await client.query(`
                CREATE TABLE IF NOT EXISTS alarm_history (
                    id SERIAL PRIMARY KEY,
                    generator_id VARCHAR(50) NOT NULL,
                    alarm_code INT NOT NULL,
                    alarm_message TEXT,
                    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_time TIMESTAMP,
                    acknowledged BOOLEAN DEFAULT FALSE,
                    acknowledged_at TIMESTAMP,
                    acknowledged_by VARCHAR(100)
                );
            `);

            // Migration: severidade separada "Aviso" (amarelo) vs "Falha" (vermelho, default).
            // Linhas antigas continuam FALHA pelo DEFAULT — nada muda pra trás.
            try {
                await client.query("ALTER TABLE alarm_history ADD COLUMN IF NOT EXISTS alarm_type VARCHAR(10) NOT NULL DEFAULT 'FALHA'");
            } catch (e) {
                console.log("Migration alarm_history.alarm_type already applied or failed:", e.message);
            }

            // Create Generator Readings Table (Historical Power Data for Charts)
            await client.query(`
                CREATE TABLE IF NOT EXISTS generator_readings (
                    id SERIAL PRIMARY KEY,
                    generator_id VARCHAR(50) NOT NULL,
                    active_power NUMERIC(10,2) DEFAULT 0,
                    mains_active_power NUMERIC(10,2),
                    rpm NUMERIC DEFAULT 0,
                    frequency NUMERIC(5,2) DEFAULT 0,
                    voltage_l1 NUMERIC DEFAULT 0,
                    current_l1 NUMERIC DEFAULT 0,
                    fuel_level NUMERIC DEFAULT 0,
                    engine_temp NUMERIC DEFAULT 0,
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Migration: add mains_active_power column to existing tables.
            // Only AGC-150 (and any future controller that reports mains bus
            // power separately) populates this; NULL means "not reported".
            try {
                await client.query("ALTER TABLE generator_readings ADD COLUMN IF NOT EXISTS mains_active_power NUMERIC(10,2)");
            } catch (e) {
                console.log("Migration generator_readings.mains_active_power already applied or failed:", e.message);
            }

            // Create Location History Table (GPS trail for modems with GNSS).
            // A new row is only written when the unit moves ≥100m from the last
            // recorded point (see saveGpsReport in tcp-bridge.js), so a stationary
            // generator adds nothing here — the table only grows when it travels.
            await client.query(`
                CREATE TABLE IF NOT EXISTS location_history (
                    id SERIAL PRIMARY KEY,
                    generator_id VARCHAR(50) NOT NULL,
                    latitude NUMERIC(10,6) NOT NULL,
                    longitude NUMERIC(10,6) NOT NULL,
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create Audit Log Table — trilha de quem fez o quê (comandos de
            // gerador, créditos, usuários, empresas). Append-only.
            await client.query(`
                CREATE TABLE IF NOT EXISTS audit_log (
                    id SERIAL PRIMARY KEY,
                    user_id INT,
                    user_email VARCHAR(255),
                    action VARCHAR(80) NOT NULL,
                    target_type VARCHAR(50),
                    target_id VARCHAR(120),
                    target_label VARCHAR(255),
                    details JSONB,
                    ip VARCHAR(64),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create index for fast time-range queries
            try {
                await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC)`);
                await client.query(`CREATE INDEX IF NOT EXISTS idx_readings_gen_time ON generator_readings (generator_id, recorded_at DESC)`);
                await client.query(`CREATE INDEX IF NOT EXISTS idx_alarm_history_gen_end ON alarm_history (generator_id, end_time DESC)`);
                await client.query(`CREATE INDEX IF NOT EXISTS idx_location_history_gen_time ON location_history (generator_id, recorded_at DESC)`);
            } catch(e) { console.log('Index creation skipped:', e.message); }

            // --- QUOTATION MODULE (QM) TABLES ---
            await client.query(`
                CREATE TABLE IF NOT EXISTS qm_clientes (
                    id SERIAL PRIMARY KEY,
                    razao_social VARCHAR(255) NOT NULL,
                    cnpj_cpf VARCHAR(50),
                    ie VARCHAR(50),
                    endereco TEXT,
                    bairro VARCHAR(100),
                    cep VARCHAR(20),
                    uf VARCHAR(2),
                    municipio VARCHAR(100),
                    contato VARCHAR(100),
                    fones VARCHAR(100),
                    email VARCHAR(100),
                    representante VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_geradores (
                    id SERIAL PRIMARY KEY,
                    modelo VARCHAR(255) NOT NULL,
                    descricao TEXT,
                    unidade VARCHAR(10),
                    valor_unitario NUMERIC(10,2),
                    protecao TEXT,
                    tensoes VARCHAR(255),
                    finame VARCHAR(255),
                    mda VARCHAR(255)
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_motores (
                    id SERIAL PRIMARY KEY,
                    modelo VARCHAR(255) NOT NULL,
                    descricao TEXT,
                    protecao TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_alternadores (
                    id SERIAL PRIMARY KEY,
                    modelo VARCHAR(255) NOT NULL,
                    descricao TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_modulos (
                    id SERIAL PRIMARY KEY,
                    modelo VARCHAR(255) NOT NULL,
                    descricao TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_acessorios (
                    id SERIAL PRIMARY KEY,
                    grupo VARCHAR(255) NOT NULL,
                    itens_incluidos TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_catalogo_dimensao (
                    id SERIAL PRIMARY KEY,
                    id_dimensionamento VARCHAR(255) NOT NULL,
                    dimensoes TEXT
                );

                CREATE TABLE IF NOT EXISTS qm_propostas (
                    id SERIAL PRIMARY KEY,
                    nprop INT,
                    anoprop INT,
                    numero_proposta VARCHAR(50),
                    status VARCHAR(50) DEFAULT 'RASCUNHO',
                    data_emissao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    cliente_id INT REFERENCES qm_clientes(id),
                    valor_total NUMERIC(15,2),
                    prazo_entrega VARCHAR(255),
                    forma_pagamento VARCHAR(255),
                    frete VARCHAR(100),
                    ipi VARCHAR(100),
                    valido_ate TIMESTAMP,
                    gerador_id INT REFERENCES qm_catalogo_geradores(id),
                    quantidade INT DEFAULT 1,
                    motor_id INT REFERENCES qm_catalogo_motores(id),
                    alternador_id INT REFERENCES qm_catalogo_alternadores(id),
                    modulo_id INT REFERENCES qm_catalogo_modulos(id),
                    acessorio_id INT REFERENCES qm_catalogo_acessorios(id),
                    dimensao_id INT REFERENCES qm_catalogo_dimensao(id),
                    outros_acessorios TEXT
                );
            `);



            // Add Real-Time Columns if they don't exist (Migration)
            const columnsToAdd = [
                "location TEXT",
                "power_kva NUMERIC",
                "avg_voltage INTEGER DEFAULT 0",
                "voltage_l1 INTEGER DEFAULT 0",
                "voltage_l2 INTEGER DEFAULT 0",
                "voltage_l3 INTEGER DEFAULT 0",
                "current_l1 INTEGER DEFAULT 0",
                "current_l2 INTEGER DEFAULT 0",
                "current_l3 INTEGER DEFAULT 0",
                "frequency NUMERIC(5,2) DEFAULT 0",
                "power_factor NUMERIC(4,2) DEFAULT 0",
                "active_power NUMERIC(10,2) DEFAULT 0",
                "rpm INTEGER DEFAULT 0",
                "oil_pressure NUMERIC(5,2) DEFAULT 0",
                "engine_temp INTEGER DEFAULT 0",
                "fuel_level INTEGER DEFAULT 0",
                "battery_voltage NUMERIC(5,2) DEFAULT 0",
                "total_hours INTEGER DEFAULT 0",
                "mains_voltage_l1 INTEGER DEFAULT 0",
                "mains_voltage_l2 INTEGER DEFAULT 0",
                "mains_voltage_l3 INTEGER DEFAULT 0",
                "mains_frequency NUMERIC(5,2) DEFAULT 0",
                "voltage_l12 INTEGER DEFAULT 0",
                "voltage_l23 INTEGER DEFAULT 0",
                "voltage_l31 INTEGER DEFAULT 0",
                "run_hours NUMERIC(10,2) DEFAULT 0",
                "mains_current_l1 NUMERIC(6,1) DEFAULT 0",
                "mains_current_l2 NUMERIC(6,1) DEFAULT 0",
                "mains_current_l3 NUMERIC(6,1) DEFAULT 0",
                // Número de série do controlador, lido via Modbus quando o protocolo expõe
                // (DSE GenComm Page 3 offset 2-3; Cummins PowerCommand reg 43049-43064).
                "serial_number VARCHAR(64)"
            ];

            for (const col of columnsToAdd) {
                try {
                    // Extract column name for "IF NOT EXISTS" check isn't trivial in one line for all PG versions in raw query,
                    // but PG 9.6+ supports ADD COLUMN IF NOT EXISTS.
                    const colName = col.split(' ')[0];
                    const colDef = col.substring(col.indexOf(' ') + 1);
                    await client.query(`ALTER TABLE generators ADD COLUMN IF NOT EXISTS ${colName} ${colDef}`);
                } catch (e) {
                    console.log(`Column migration check for ${col} ignored or failed: `, e.message);
                }
            }

            // Fix: Ensure run_hours is NUMERIC (for legacy tables that created it as INTEGER)
            try {
                await client.query("ALTER TABLE generators ALTER COLUMN run_hours TYPE NUMERIC(10,2)");
            } catch (e) {
                console.log("Migration of run_hours type skipped:", e.message);
            }

            // Fix: Widen other columns to prevent overflow
            try {
                await client.query("ALTER TABLE generators ALTER COLUMN battery_voltage TYPE NUMERIC(10,2)");
                await client.query("ALTER TABLE generators ALTER COLUMN oil_pressure TYPE NUMERIC(10,2)");
                await client.query("ALTER TABLE generators ALTER COLUMN power_factor TYPE NUMERIC(10,2)");
                await client.query("ALTER TABLE generators ALTER COLUMN mains_frequency TYPE NUMERIC(10,2)");

                // Add QM columns if they don't exist
                await client.query("ALTER TABLE qm_catalogo_geradores ADD COLUMN IF NOT EXISTS finame VARCHAR(255)");
                await client.query("ALTER TABLE qm_catalogo_geradores ADD COLUMN IF NOT EXISTS mda VARCHAR(255)");

                console.log("Database migrations checked/applied.");
            } catch (e) {
                console.log("Migrations skipped or failed:", e.message);
            }

            client.release();
            console.log('Database initialized successfully.');
            return; // Success, exit loop
        } catch (err) {
            console.error(`Failed to initialize database (Attempt ${i + 1}/${retries}):`, err.message);
            if (i < retries - 1) {
                console.log(`Retrying in ${delay / 1000}s...`);
                await new Promise(res => setTimeout(res, delay));
            } else {
                console.error('Max retries reached. Database initialization failed.');
            }
        }
    }
};

export default initDb;
