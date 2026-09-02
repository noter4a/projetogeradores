import express from 'express';
import pool from '../db.js';
import { updatePollingList, runModbusScan, getModbusScanStatus, readModbusRegisterOnDemand, writeModbusRegisterOnDemand } from '../services/mqtt.js';
import { getRegisterReference } from '../data/register-reference.js';
import { requireRole } from '../middleware/auth.js';
import { assertGeneratorControlAccess, assertGeneratorReadAccess } from '../lib/accessControl.js';
import { logAudit } from '../lib/audit.js';
import { getIo } from '../lib/socket.js';

const router = express.Router();

// Garante que o "ID do Dispositivo" (campo `ip` — é o tópico MQTT ou o
// host/IP, dependendo do protocolo) não fique duplicado entre dois
// geradores. mqtt.js resolve a mensagem recebida via
// `WHERE id = $1 OR connection_info->>'ip' = $1 LIMIT 1` — se dois
// geradores tivessem o mesmo valor aqui, a telemetria de um deles nunca
// mais apareceria (sempre cai no primeiro que o banco devolver). Vazio
// não conta como duplicado (alguns cadastros legítimos ficam sem, ex.
// enquanto o dispositivo físico ainda não chegou). excludeId é usado na
// edição, pra não acusar o próprio gerador de "duplicado" dele mesmo —
// e por isso o mesmo ID pode ser reaproveitado livremente assim que o
// gerador que o usava for excluído (a linha some da tabela).
async function findDeviceIdConflict(ip, excludeId = null) {
    const trimmed = (ip || '').trim();
    if (!trimmed) return null;
    const params = excludeId ? [trimmed, excludeId] : [trimmed];
    const result = await pool.query(
        `SELECT id, name FROM generators
         WHERE connection_info->>'ip' = $1 ${excludeId ? 'AND id != $2' : ''}
         LIMIT 1`,
        params
    );
    return result.rows[0] || null;
}

// PATCH /api/generators/:id/polling — pause/resume MQTT reads for a single generator
// Lets operators stop polling a problematic unit so it doesn't occupy the shared RS485 bus.
router.patch('/:id/polling', async (req, res) => {
    const { id } = req.params;
    const { paused } = req.body;

    if (typeof paused !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Campo "paused" (boolean) é obrigatório.' });
    }

    try {
        const access = await assertGeneratorControlAccess(req.user, id);
        if (!access.allowed) {
            return res.status(access.status).json({ success: false, message: access.message });
        }

        const result = await pool.query(
            `UPDATE generators
             SET connection_info = jsonb_set(COALESCE(connection_info, '{}'::jsonb), '{pollingPaused}', $1::jsonb, true)
             WHERE id = $2
                OR connection_info->>'ip' = $2
                OR connection_info->>'connectionName' = $2
             RETURNING id`,
            [JSON.stringify(paused), id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Gerador não encontrado.' });
        }

        console.log(`[API] Polling ${paused ? 'PAUSED' : 'RESUMED'} for ${id} by ${req.user?.email}`);

        // Apply the change to the live polling engine, then tell clients to refresh.
        await updatePollingList();
        getIo().emit('generator:list_changed');

        res.json({ success: true, paused });
    } catch (err) {
        console.error('[API] Toggle polling error:', err);
        res.status(500).json({ success: false, message: 'Erro ao alterar o estado de leitura.' });
    }
});

// Generator Routes

// GET /api/generators
// FIX #9: Rota protegida com autenticação
router.get('/', async (req, res) => {
    try {
        let query = `
            SELECT g.*, c.name as company_name
            FROM generators g
            LEFT JOIN companies c ON g.company_id = c.id
        `;
        const params = [];

        // Filter by company_id if user is not admin
        if (req.user.role !== 'ADMIN') {
            query += ` WHERE g.company_id = $1`;
            params.push(req.user.companyId || -1);
        }

        query += ` ORDER BY g.created_at ASC`;

        const result = await pool.query(query, params);

        // Map DB fields to Frontend types
        const generators = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            location: row.location,
            model: row.model,
            serialNumber: row.serial_number || null,
            powerKVA: row.power_kva,
            status: row.status,
            connectionName: row.connection_info?.connectionName || null,
            controller: row.connection_info?.controller || null,
            protocol: row.connection_info?.protocol || null,
            ip: row.connection_info?.ip || null,
            port: row.connection_info?.port || null,
            slaveId: row.connection_info?.slaveId || null,
            deviceType: row.connection_info?.deviceType || 'modem',
            agc150Profile: row.connection_info?.agc150Profile || 'gen',
            pollingPaused: row.connection_info?.pollingPaused === true,
            gpsHasFix: row.connection_info?.gps?.hasFix === true,
            latitude: row.connection_info?.gps?.lat ?? null,
            longitude: row.connection_info?.gps?.lon ?? null,
            gpsUpdatedAt: row.connection_info?.gps?.updatedAt ?? null,
            companyId: row.company_id,
            companyName: row.company_name,
            lastDataReceived: row.last_connected ? new Date(row.last_connected).getTime() : null,

            // Map Persistent Real-Time Values
            fuelLevel: row.fuel_level === null || row.fuel_level === 65535 ? null : Number(row.fuel_level),
            engineTemp: row.engine_temp === null || row.engine_temp === 65535 ? null : Number(row.engine_temp),
            oilPressure: row.oil_pressure === null || parseFloat(row.oil_pressure) === 655.35 ? null : parseFloat(row.oil_pressure),
            batteryVoltage: row.battery_voltage === null || parseFloat(row.battery_voltage) === 6553.5 ? null : parseFloat(row.battery_voltage),
            rpm: row.rpm === null || row.rpm === 65535 ? null : Number(row.rpm),
            // Map 'totalHours' to the 'run_hours' column which we are actively updating
            totalHours: parseFloat(row.run_hours || 0),
            lastMaintenance: new Date().toISOString().split('T')[0],

            voltageL1: row.voltage_l1 === null || row.voltage_l1 === 65535 ? null : Number(row.voltage_l1),
            voltageL2: row.voltage_l2 === null || row.voltage_l2 === 65535 ? null : Number(row.voltage_l2),
            voltageL3: row.voltage_l3 === null || row.voltage_l3 === 65535 ? null : Number(row.voltage_l3),
            currentL1: row.current_l1 === null || row.current_l1 === 65535 ? null : Number(row.current_l1),
            currentL2: row.current_l2 === null || row.current_l2 === 65535 ? null : Number(row.current_l2),
            currentL3: row.current_l3 === null || row.current_l3 === 65535 ? null : Number(row.current_l3),

            mainsVoltageL1: row.mains_voltage_l1 === null || row.mains_voltage_l1 === 65535 ? null : Number(row.mains_voltage_l1),
            mainsVoltageL2: row.mains_voltage_l2 === null || row.mains_voltage_l2 === 65535 ? null : Number(row.mains_voltage_l2),
            mainsVoltageL3: row.mains_voltage_l3 === null || row.mains_voltage_l3 === 65535 ? null : Number(row.mains_voltage_l3),
            mainsFrequency: row.mains_frequency === null || parseFloat(row.mains_frequency) === 6553.5 ? null : parseFloat(row.mains_frequency),

            frequency: row.frequency === null || parseFloat(row.frequency) === 6553.5 ? null : parseFloat(row.frequency),
            powerFactor: row.power_factor === null || parseFloat(row.power_factor) === 655.35 || parseFloat(row.power_factor) === 6553.5 ? null : parseFloat(row.power_factor),
            activePower: row.active_power === null || row.active_power === 65535 ? null : Number(row.active_power),
            activePowerTotal: row.active_power === null || row.active_power === 65535 ? null : Number(row.active_power),

            voltageL12: row.voltage_l12 === null || row.voltage_l12 === 65535 ? null : Number(row.voltage_l12),
            voltageL23: row.voltage_l23 === null || row.voltage_l23 === 65535 ? null : Number(row.voltage_l23),
            voltageL31: row.voltage_l31 === null || row.voltage_l31 === 65535 ? null : Number(row.voltage_l31)
        }));
        res.json(generators);
    } catch (err) {
        console.error('Get generators error:', err);
        res.status(500).json({ message: 'Erro ao buscar geradores' });
    }
});

// POST /api/generators - PROTECTED (Admin Only)
router.post('/', requireRole('ADMIN'), async (req, res) => {
    const gen = req.body;
    try {
        const conflict = await findDeviceIdConflict(gen.ip);
        if (conflict) {
            return res.status(409).json({
                message: `Já existe um gerador cadastrado com este ID de dispositivo ("${gen.ip}"): ${conflict.name}. Exclua-o antes ou use um ID diferente.`,
            });
        }

        const connectionInfo = {
            connectionName: gen.connectionName,
            controller: gen.controller,
            protocol: gen.protocol,
            ip: gen.ip,
            port: gen.port,
            slaveId: gen.slaveId,
            deviceType: gen.deviceType || 'modem',
            ...(gen.agc150Profile ? { agc150Profile: gen.agc150Profile } : {}),
        };

        await pool.query(
            "INSERT INTO generators (id, name, location, model, power_kva, status, connection_info, company_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [gen.id, gen.name, gen.location, gen.model, gen.powerKVA, gen.status || 'STOPPED', JSON.stringify(connectionInfo), gen.companyId || null]
        );

        // Instantly reload MQTT polling configurations and notify clients
        try {
            await updatePollingList();
        } catch (pollErr) {
            console.error('[MQTT-UPDATE] Failed to update polling configurations:', pollErr);
        }
        getIo().emit('generator:list_changed');

        res.status(201).json({ message: 'Gerador criado com sucesso' });
    } catch (err) {
        // 23505 = unique_violation — fallback pra corrida entre duas criações
        // simultâneas com o mesmo ID (a checagem acima já cobre o caso comum,
        // isso só pega a janela entre o SELECT e o INSERT).
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Já existe um gerador cadastrado com este ID.' });
        }
        console.error('Create generator error:', err);
        res.status(500).json({ message: 'Erro ao criar gerador' });
    }
});

// PUT /api/generators/:id - PROTECTED (Admin Only)
router.put('/:id', requireRole('ADMIN'), async (req, res) => {
    const { id } = req.params;
    const gen = req.body;
    try {
        const conflict = await findDeviceIdConflict(gen.ip, id);
        if (conflict) {
            return res.status(409).json({
                message: `Já existe um gerador cadastrado com este ID de dispositivo ("${gen.ip}"): ${conflict.name}. Exclua-o antes ou use um ID diferente.`,
            });
        }

        // Preserve the polling pause flag (managed by the dedicated /polling endpoint)
        // so editing a generator here doesn't accidentally re-enable reads.
        const existing = await pool.query("SELECT connection_info FROM generators WHERE id=$1", [id]);
        const existingPaused = existing.rows[0]?.connection_info?.pollingPaused === true;
        const pollingPaused = typeof gen.pollingPaused === 'boolean' ? gen.pollingPaused : existingPaused;
        const existingGps = existing.rows[0]?.connection_info?.gps; // GPS is reported by the modem, not the form

        const connectionInfo = {
            connectionName: gen.connectionName,
            controller: gen.controller,
            protocol: gen.protocol,
            ip: gen.ip,
            port: gen.port,
            slaveId: gen.slaveId,
            deviceType: gen.deviceType || 'modem',
            ...(gen.agc150Profile ? { agc150Profile: gen.agc150Profile } : {}),
            ...(pollingPaused ? { pollingPaused: true } : {}),
            ...(existingGps ? { gps: existingGps } : {}),
        };

        await pool.query(
            "UPDATE generators SET name=$1, location=$2, model=$3, power_kva=$4, status=$5, connection_info=$6, company_id=$7 WHERE id=$8",
            [gen.name, gen.location, gen.model, gen.powerKVA, gen.status, JSON.stringify(connectionInfo), gen.companyId || null, id]
        );

        // Instantly reload MQTT polling configurations and notify clients
        try {
            await updatePollingList();
        } catch (pollErr) {
            console.error('[MQTT-UPDATE] Failed to update polling configurations:', pollErr);
        }
        getIo().emit('generator:list_changed');

        res.json({ message: 'Gerador atualizado' });
    } catch (err) {
        console.error('Update generator error:', err);
        res.status(500).json({ message: 'Erro ao atualizar gerador' });
    }
});

// DELETE /api/generators/:id - PROTECTED (Admin Only)
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM generators WHERE id = $1', [id]);

        // Instantly reload MQTT polling configurations and notify clients
        try {
            await updatePollingList();
        } catch (pollErr) {
            console.error('[MQTT-UPDATE] Failed to update polling configurations:', pollErr);
        }
        getIo().emit('generator:list_changed');

        res.json({ message: 'Gerador removido' });
    } catch (err) {
        console.error('Delete generator error:', err);
        res.status(500).json({ message: 'Erro ao remover gerador' });
    }
});

// POST /api/generators/:id/modbus-scan — K30XL direct RS232 register discovery (Admin)
router.post('/:id/modbus-scan', requireRole('ADMIN'), async (req, res) => {
    const { id } = req.params;
    const status = getModbusScanStatus(id);
    if (status.running) {
        return res.status(409).json({
            message: 'Varredura Modbus já em andamento para este gerador.',
            ...status,
        });
    }

    res.status(202).json({
        message: `Varredura Modbus iniciada para ${id}. Acompanhe com: docker logs ciklo-api -f | grep MODBUS-SCAN`,
        deviceId: id,
    });

    runModbusScan(id, req.body ?? {}).then((result) => {
        console.log(`[MODBUS-SCAN] API scan finished for ${id}:`, JSON.stringify(result.summary ?? result));
    }).catch((err) => {
        console.error(`[MODBUS-SCAN] API scan failed for ${id}:`, err.message);
    });
});

// GET /api/generators/:id/modbus-scan — scan progress (Admin)
router.get('/:id/modbus-scan', requireRole('ADMIN'), (req, res) => {
    res.json(getModbusScanStatus(req.params.id));
});

// GET /api/generators/:id/modbus-registers — tabela de referência de registradores
// conhecidos para o controlador deste gerador (Admin/Técnico — mesmo gate da aba
// "Controle Avançado" no frontend).
router.get('/:id/modbus-registers', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
    const { id } = req.params;
    const access = await assertGeneratorReadAccess(req.user, id);
    if (!access.allowed) {
        return res.status(access.status).json({ message: access.message });
    }
    try {
        const result = await pool.query(
            `SELECT connection_info->>'controller' AS controller FROM generators
             WHERE id = $1 OR connection_info->>'ip' = $1 OR connection_info->>'connectionName' = $1
             LIMIT 1`,
            [id]
        );
        const controller = result.rows[0]?.controller || null;
        res.json({ controller, registers: getRegisterReference(controller) });
    } catch (err) {
        console.error('Get modbus register reference error:', err);
        res.status(500).json({ message: 'Erro ao buscar referência de registradores.' });
    }
});

// POST /api/generators/:id/modbus-read — leitura avulsa de um registrador, para
// inspecionar qualquer endereço sem abrir o software do fabricante. Pausa o
// polling normal por um instante, faz UMA leitura Modbus e retoma — mesmo
// mecanismo já usado (e testado em produção) pela varredura de descoberta.
router.post('/:id/modbus-read', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
    const { id } = req.params;
    const access = await assertGeneratorReadAccess(req.user, id);
    if (!access.allowed) {
        return res.status(access.status).json({ message: access.message });
    }

    const startAddress = parseInt(req.body.startAddress, 10);
    const quantity = parseInt(req.body.quantity, 10) || 1;
    const fn = parseInt(req.body.fn, 10) || 3;

    if (!Number.isInteger(startAddress)) {
        return res.status(400).json({ message: 'Endereço inválido.' });
    }

    try {
        // dr164Devices (a lista de polling em mqtt.js) é indexada pelo IP/nome de
        // conexão do modem (ex: "Ciklo55"), não pelo id do banco (GEN-xxx) — o
        // mesmo motivo pelo qual o controle remoto do gerador já usa `gen.ip ||
        // gen.id` no frontend. Resolve aqui também para aceitar qualquer forma.
        const resolved = await pool.query(
            `SELECT COALESCE(connection_info->>'ip', connection_info->>'connectionName', id) AS device_id
             FROM generators
             WHERE id = $1 OR connection_info->>'ip' = $1 OR connection_info->>'connectionName' = $1
             LIMIT 1`,
            [id]
        );
        const deviceId = resolved.rows[0]?.device_id || id;
        const result = await readModbusRegisterOnDemand(deviceId, { startAddress, quantity, fn });
        logAudit({
            user: req.user,
            action: 'generator.modbus_read',
            targetType: 'generator',
            targetId: id,
            details: { startAddress, quantity, fn, kind: result.classification?.kind },
            ip: req.ip,
        });
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error('Modbus on-demand read error:', err);
        res.status(500).json({ message: 'Erro ao ler registrador.' });
    }
});

// POST /api/generators/:id/modbus-write — escrita avulsa de um registrador, pra
// testes remotos (ex: simular falha de rede no DSE via GenComm 'Remote Mains
// Fail Enable', chave 35793, sem precisar desligar a rede de verdade). Mesmo
// controle de acesso do /control (assertGeneratorControlAccess) — escrever num
// registrador arbitrário é pelo menos tão sensível quanto os comandos normais
// de start/stop, então não usa o assertGeneratorReadAccess mais permissivo do
// /modbus-read.
router.post('/:id/modbus-write', async (req, res) => {
    const { id } = req.params;
    const access = await assertGeneratorControlAccess(req.user, id);
    if (!access.allowed) {
        return res.status(access.status).json({ message: access.message });
    }

    const address = parseInt(req.body.address, 10);
    const value = parseInt(req.body.value, 10);

    if (!Number.isInteger(address)) {
        return res.status(400).json({ message: 'Endereço inválido.' });
    }
    if (!Number.isInteger(value)) {
        return res.status(400).json({ message: 'Valor inválido.' });
    }

    try {
        const resolved = await pool.query(
            `SELECT COALESCE(connection_info->>'ip', connection_info->>'connectionName', id) AS device_id
             FROM generators
             WHERE id = $1 OR connection_info->>'ip' = $1 OR connection_info->>'connectionName' = $1
             LIMIT 1`,
            [id]
        );
        const deviceId = resolved.rows[0]?.device_id || id;
        const result = await writeModbusRegisterOnDemand(deviceId, { address, value });
        logAudit({
            user: req.user,
            action: 'generator.modbus_write',
            targetType: 'generator',
            targetId: id,
            details: { address, value, success: result.success },
            ip: req.ip,
        });
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error('Modbus on-demand write error:', err);
        res.status(500).json({ message: 'Erro ao escrever registrador.' });
    }
});

// GET /api/generators/:id/readings - Historical Power Data for Charts
router.get('/:id/readings', async (req, res) => {
    const { id } = req.params;

    const access = await assertGeneratorReadAccess(req.user, id);
    if (!access.allowed) {
        return res.status(access.status).json({ message: access.message });
    }

    const range = req.query.range || '24h'; // 24h, 7d, 30d

    let intervalSql;
    let bucket; // seconds for downsampling
    switch (range) {
        case '7d':
            intervalSql = '7 days';
            bucket = 300; // 5 min avg
            break;
        case '30d':
            intervalSql = '30 days';
            bucket = 1800; // 30 min avg
            break;
        case '24h':
        default:
            intervalSql = '24 hours';
            bucket = 60; // 1 min avg
            break;
    }

    try {
        // Downsample to avoid returning thousands of rows.
        // `power` (the bucket AVERAGE) is what the chart line plots. power_max/
        // power_min are the true extremes WITHIN each bucket — without them the
        // stats panel would report "peak" as the highest bucket average, which
        // badly understates the real peak on wide ranges (30d buckets are 30min
        // averages). samples/active_samples let the client compute energy and
        // running time without a second round trip.
        const result = await pool.query(`
            SELECT
                to_timestamp(floor(extract(epoch from recorded_at) / $2) * $2) as time,
                ROUND(AVG(active_power)::numeric, 2) as power,
                ROUND(MAX(active_power)::numeric, 2) as power_max,
                ROUND(MIN(active_power)::numeric, 2) as power_min,
                COUNT(*) as samples,
                COUNT(*) FILTER (WHERE active_power > 0) as active_samples,
                ROUND(AVG(rpm)::numeric, 0) as rpm,
                ROUND(AVG(frequency)::numeric, 2) as frequency
            FROM generator_readings
            WHERE (generator_id = $1 OR generator_id = (SELECT connection_info->>'ip' FROM generators WHERE id = $1 LIMIT 1))
              AND recorded_at >= NOW() - $3::interval
            GROUP BY time
            ORDER BY time ASC
        `, [id, bucket, intervalSql]);

        res.json(result.rows.map(r => ({ ...r, bucketSeconds: bucket })));
    } catch (err) {
        console.error('Get readings error:', err);
        res.status(500).json({ message: 'Erro ao buscar leituras.' });
    }
});

// GET /api/generators/:id/location-history - GPS trail (points only logged on ≥100m moves)
router.get('/:id/location-history', async (req, res) => {
    const { id } = req.params;

    const access = await assertGeneratorReadAccess(req.user, id);
    if (!access.allowed) {
        return res.status(access.status).json({ message: access.message });
    }

    // Cap how far back we look so a very well-travelled unit can't return an
    // unbounded payload; the client draws the path in chronological order.
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);

    try {
        const result = await pool.query(`
            SELECT latitude, longitude, recorded_at
            FROM location_history
            WHERE generator_id = $1
               OR generator_id = (SELECT connection_info->>'ip' FROM generators WHERE id = $1 LIMIT 1)
            ORDER BY recorded_at DESC
            LIMIT $2
        `, [id, limit]);

        // Return oldest-first so the frontend can draw the polyline start -> end directly.
        const points = result.rows.reverse().map(r => ({
            latitude: Number(r.latitude),
            longitude: Number(r.longitude),
            recordedAt: r.recorded_at,
        }));
        res.json(points);
    } catch (err) {
        console.error('Get location history error:', err);
        res.status(500).json({ message: 'Erro ao buscar histórico de localização.' });
    }
});

export default router;
