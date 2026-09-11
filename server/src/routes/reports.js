import express from 'express';
import pool from '../db.js';
import { assertGeneratorReadAccess } from '../lib/accessControl.js';

const router = express.Router();

/**
 * GET /api/reports/monthly
 * Gera o relatório operacional mensal consolidado de grupos geradores.
 * Query Params:
 *   - generatorId: ID do gerador ou 'all'
 *   - month: YYYY-MM (ex: "2026-09")
 */
router.get('/monthly', async (req, res) => {
    try {
        const { generatorId } = req.query;
        let { month } = req.query;

        // Valida ou define o mês de referência (padrão: mês corrente)
        const now = new Date();
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            month = `${y}-${m}`;
        }

        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const monthNum = parseInt(monthStr, 10);

        // Define limites do período de forma segura (strings ISO para evitar distorção de fuso horário)
        const startDate = `${yearStr}-${monthStr}-01 00:00:00`;
        const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
        const nextYear = monthNum === 12 ? year + 1 : year;
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`;
        const daysInMonth = new Date(year, monthNum, 0).getDate();

        // 1. Busca os geradores acessíveis ao usuário
        let genQuery = `
            SELECT 
                g.id, g.name, g.location, g.model, g.power_kva, 
                g.total_hours, g.run_hours, g.serial_number,
                g.connection_info, g.company_id,
                c.name as company_name
            FROM generators g
            LEFT JOIN companies c ON g.company_id = c.id
        `;
        const genParams = [];

        // Filtro por permissões de usuário
        const userRole = (req.user?.role || '').toUpperCase();
        if (userRole !== 'ADMIN') {
            if (req.user?.companyId != null) {
                genParams.push(req.user.companyId);
                genQuery += ` WHERE g.company_id = $${genParams.length}`;
            } else {
                // Caso o token não tenha companyId, checa se há geradores atribuídos no banco
                const uRes = await pool.query('SELECT assigned_generators, company_id FROM users WHERE id = $1', [req.user?.id]);
                const uRow = uRes.rows[0];
                if (uRow?.company_id != null) {
                    genParams.push(uRow.company_id);
                    genQuery += ` WHERE g.company_id = $${genParams.length}`;
                } else if (Array.isArray(uRow?.assigned_generators) && uRow.assigned_generators.length > 0) {
                    genParams.push(uRow.assigned_generators);
                    genQuery += ` WHERE g.id = ANY($${genParams.length})`;
                } else {
                    return res.json({
                        reportPeriod: { month, year, monthNum, startDate, endDate, daysInMonth },
                        generator: null,
                        generatorsList: [],
                        kpis: getEmptyKpis(),
                        dailyOperation: [],
                        mainsOutages: [],
                        alarms: []
                    });
                }
            }
        }

        genQuery += ' ORDER BY g.name ASC';
        const genResult = await pool.query(genQuery, genParams);
        const accessibleGenerators = genResult.rows;

        if (accessibleGenerators.length === 0) {
            return res.json({
                reportPeriod: { month, year, monthNum, startDate, endDate, daysInMonth },
                generator: null,
                generatorsList: [],
                kpis: getEmptyKpis(),
                dailyOperation: [],
                mainsOutages: [],
                alarms: []
            });
        }

        // Determina o gerador alvo (ou o primeiro disponível)
        let selectedGenerator = null;
        if (generatorId && generatorId !== 'all') {
            selectedGenerator = accessibleGenerators.find(g => g.id === generatorId);
            if (!selectedGenerator) {
                // Checa acesso explícito
                const access = await assertGeneratorReadAccess(req.user, generatorId);
                if (!access.allowed) {
                    return res.status(access.status).json({ message: access.message });
                }
            }
        }

        if (!selectedGenerator && generatorId !== 'all') {
            selectedGenerator = accessibleGenerators[0];
        }

        const targetGenIds = selectedGenerator 
            ? [selectedGenerator.id] 
            : accessibleGenerators.map(g => g.id);

        // Coleta possíveis aliases (IPs e connectionNames) para cruzamento de telemetria
        const targetAliases = new Set(targetGenIds);
        accessibleGenerators
            .filter(g => targetGenIds.includes(g.id))
            .forEach(g => {
                if (g.connection_info?.ip) targetAliases.add(g.connection_info.ip);
                if (g.connection_info?.connectionName) targetAliases.add(g.connection_info.connectionName);
            });
        const aliasesArray = Array.from(targetAliases);

        // 2. Consulta telemetria de funcionamento (generator_readings)
        const readingsQuery = `
            SELECT
                DATE(recorded_at AT TIME ZONE 'America/Sao_Paulo') as day_date,
                COUNT(*) as total_samples,
                COUNT(*) FILTER (WHERE active_power > 1 OR rpm > 300) as running_samples,
                ROUND(COALESCE(AVG(active_power) FILTER (WHERE active_power > 1), 0)::numeric, 2) as avg_power_kw,
                ROUND(COALESCE(MAX(active_power), 0)::numeric, 2) as peak_power_kw,
                ROUND(COALESCE(SUM(active_power * 15.0 / 3600.0) FILTER (WHERE active_power > 1), 0)::numeric, 2) as total_kwh,
                ROUND(COALESCE(AVG(engine_temp) FILTER (WHERE engine_temp > 0), 0)::numeric, 1) as avg_temp
            FROM generator_readings
            WHERE generator_id = ANY($1)
              AND recorded_at >= $2::timestamp AND recorded_at < $3::timestamp
            GROUP BY day_date
            ORDER BY day_date ASC
        `;
        const readingsResult = await pool.query(readingsQuery, [aliasesArray, startDate, endDate]);

        // 3. Monta a série diária (preenche todos os dias do mês de 1 até N)
        const dailyMap = new Map();
        readingsResult.rows.forEach(r => {
            let d = r.day_date;
            if (d instanceof Date) {
                d = d.toISOString().split('T')[0];
            } else if (typeof d === 'string') {
                d = d.split('T')[0];
            }
            dailyMap.set(d, r);
        });

        let totalOperatingHours = 0;
        let totalEnergyKwh = 0;
        let maxPeakPowerKw = 0;
        let sumPowerKw = 0;
        let runningDaysCount = 0;

        const dailyOperation = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const dayStr = `${month}-${String(day).padStart(2, '0')}`;
            const dayData = dailyMap.get(dayStr);

            let dayHours = 0;
            let dayKwh = 0;
            let dayPeakKw = 0;
            let dayAvgKw = 0;

            if (dayData) {
                // Cada leitura de telemetria equivale a ~15s
                dayHours = parseFloat(((dayData.running_samples * 15) / 3600).toFixed(2));
                dayKwh = parseFloat(dayData.total_kwh || 0);
                dayPeakKw = parseFloat(dayData.peak_power_kw || 0);
                dayAvgKw = parseFloat(dayData.avg_power_kw || 0);

                totalOperatingHours += dayHours;
                totalEnergyKwh += dayKwh;
                if (dayPeakKw > maxPeakPowerKw) maxPeakPowerKw = dayPeakKw;
                if (dayAvgKw > 0) {
                    sumPowerKw += dayAvgKw;
                    runningDaysCount++;
                }
            }

            dailyOperation.push({
                day,
                date: dayStr,
                hours: dayHours,
                kwh: dayKwh,
                peakKw: dayPeakKw,
                avgKw: dayAvgKw
            });
        }

        totalOperatingHours = parseFloat(totalOperatingHours.toFixed(1));
        totalEnergyKwh = parseFloat(totalEnergyKwh.toFixed(1));
        const avgOperatingPowerKw = runningDaysCount > 0 ? parseFloat((sumPowerKw / runningDaysCount).toFixed(1)) : 0;

        // 4. Consulta quedas de rede da concessionária (alarm_history onde alarm_code = 9999 ou alarme de rede)
        const mainsOutagesQuery = `
            SELECT DISTINCT ON (a.id, a.start_time)
                a.id,
                a.generator_id,
                COALESCE(g.name, a.generator_id) as generator_name,
                a.alarm_message,
                a.start_time,
                a.end_time,
                ROUND(EXTRACT(EPOCH FROM (COALESCE(a.end_time, NOW()) - a.start_time))::numeric, 0) as duration_seconds
            FROM alarm_history a
            LEFT JOIN generators g ON a.generator_id = g.id OR (g.connection_info->>'ip' IS NOT NULL AND g.connection_info->>'ip' != '' AND a.generator_id = g.connection_info->>'ip')
            WHERE a.generator_id = ANY($1)
              AND (a.alarm_code = 9999 OR a.alarm_message ILIKE '%rede%' OR a.alarm_message ILIKE '%concessionária%')
              AND a.start_time >= $2::timestamp AND a.start_time < $3::timestamp
            ORDER BY a.start_time DESC, a.id DESC
        `;
        const mainsOutagesResult = await pool.query(mainsOutagesQuery, [aliasesArray, startDate, endDate]);
        const mainsOutages = mainsOutagesResult.rows.map(r => ({
            id: r.id,
            generatorId: r.generator_id,
            generatorName: r.generator_name,
            startTime: r.start_time,
            endTime: r.end_time,
            durationSeconds: parseInt(r.duration_seconds, 10) || 0,
            description: r.alarm_message || 'Queda de energia da concessionária',
            status: r.end_time ? 'NORMALIZADO' : 'EM ANDAMENTO'
        }));

        const totalMainsOutagesCount = mainsOutages.length;
        const totalMainsOutageSeconds = mainsOutages.reduce((acc, cur) => acc + cur.durationSeconds, 0);

        // 5. Consulta Falhas e Alarmes gerais ocorridos no período
        const alarmsQuery = `
            SELECT DISTINCT ON (a.id, a.start_time)
                a.id,
                a.generator_id,
                COALESCE(g.name, a.generator_id) as generator_name,
                a.alarm_code,
                a.alarm_message,
                a.alarm_type,
                a.start_time,
                a.end_time,
                a.acknowledged,
                a.acknowledged_by,
                a.acknowledged_at,
                ROUND(EXTRACT(EPOCH FROM (COALESCE(a.end_time, NOW()) - a.start_time))::numeric, 0) as duration_seconds
            FROM alarm_history a
            LEFT JOIN generators g ON a.generator_id = g.id OR (g.connection_info->>'ip' IS NOT NULL AND g.connection_info->>'ip' != '' AND a.generator_id = g.connection_info->>'ip')
            WHERE a.generator_id = ANY($1)
              AND a.alarm_code != 9999
              AND NOT (COALESCE(a.alarm_message, '') ILIKE '%rede%' OR COALESCE(a.alarm_message, '') ILIKE '%concessionária%')
              AND a.start_time >= $2::timestamp AND a.start_time < $3::timestamp
            ORDER BY a.start_time DESC, a.id DESC
            LIMIT 100
        `;
        const alarmsResult = await pool.query(alarmsQuery, [aliasesArray, startDate, endDate]);
        const alarms = alarmsResult.rows.map(r => ({
            id: r.id,
            generatorId: r.generator_id,
            generatorName: r.generator_name,
            alarmCode: r.alarm_code,
            alarmMessage: r.alarm_message,
            alarmType: r.alarm_type || 'FALHA',
            startTime: r.start_time,
            endTime: r.end_time,
            durationSeconds: parseInt(r.duration_seconds, 10) || 0,
            acknowledged: r.acknowledged,
            acknowledgedBy: r.acknowledged_by,
            acknowledgedAt: r.acknowledged_at
        }));

        // 6. Estimativa de consumo de diesel (Norma ABNT / ISO 8528)
        // Consumo médio padrão industrial: ~0.26 litros por kWh gerado.
        // Se rodou horas em vazio ou potência baixa: mínimo de 0.08 * kVA * horas.
        const nominalKva = selectedGenerator?.power_kva 
            ? parseFloat(selectedGenerator.power_kva) 
            : accessibleGenerators.reduce((acc, g) => acc + (parseFloat(g.power_kva) || 0), 0) || 150;
        let estimatedDieselLiters = 0;

        if (totalEnergyKwh > 0) {
            estimatedDieselLiters = totalEnergyKwh * 0.26;
        } else if (totalOperatingHours > 0) {
            // Em vazio / teste sem carga
            estimatedDieselLiters = totalOperatingHours * (nominalKva * 0.08);
        }
        estimatedDieselLiters = parseFloat(estimatedDieselLiters.toFixed(1));

        const avgConsumptionPerHour = totalOperatingHours > 0 
            ? parseFloat((estimatedDieselLiters / totalOperatingHours).toFixed(1)) 
            : 0;

        // Disponibilidade percentual do equipamento no mês
        // Total de horas no mês = daysInMonth * 24
        const totalHoursInMonth = daysInMonth * 24;
        const totalFaultSeconds = alarms
            .filter(a => a.alarmType === 'FALHA')
            .reduce((acc, cur) => acc + cur.durationSeconds, 0);
        const faultHours = totalFaultSeconds / 3600.0;
        const availabilityPercent = Math.max(0, Math.min(100, parseFloat(((totalHoursInMonth - faultHours) / totalHoursInMonth * 100).toFixed(2))));

        res.json({
            reportPeriod: {
                month,
                year,
                monthNum,
                startDate,
                endDate,
                daysInMonth
            },
            generator: selectedGenerator ? {
                id: selectedGenerator.id,
                name: selectedGenerator.name,
                model: selectedGenerator.model || 'GMG Diesel',
                location: selectedGenerator.location || 'Não informada',
                powerKva: nominalKva,
                serialNumber: selectedGenerator.serial_number || 'N/A',
                companyName: selectedGenerator.company_name || 'Ciklo Geradores'
            } : {
                id: 'all',
                name: 'Todos os Geradores Selecionados',
                model: 'Frota Integrada',
                location: 'Diversos Locais',
                powerKva: nominalKva,
                serialNumber: 'Diversos',
                companyName: accessibleGenerators[0]?.company_name || 'Ciklo Geradores'
            },
            generatorsList: accessibleGenerators.map(g => ({
                id: g.id,
                name: g.name,
                model: g.model,
                powerKva: g.power_kva,
                serialNumber: g.serial_number
            })),
            kpis: {
                totalOperatingHours,
                totalEnergyKwh,
                avgOperatingPowerKw,
                maxPeakPowerKw,
                mainsOutagesCount: totalMainsOutagesCount,
                mainsBackupDurationSeconds: totalMainsOutageSeconds,
                estimatedDieselLiters,
                avgConsumptionPerHour,
                totalAlarmsCount: alarms.length,
                totalFaultsCount: alarms.filter(a => a.alarmType === 'FALHA').length,
                totalWarningsCount: alarms.filter(a => a.alarmType === 'AVISO').length,
                availabilityPercent
            },
            dailyOperation,
            mainsOutages,
            alarms
        });

    } catch (err) {
        console.error('[REPORTS] Error generating monthly report:', err);
        res.status(500).json({ message: err.message || 'Erro ao gerar relatório mensal.' });
    }
});

function getEmptyKpis() {
    return {
        totalOperatingHours: 0,
        totalEnergyKwh: 0,
        avgOperatingPowerKw: 0,
        maxPeakPowerKw: 0,
        mainsOutagesCount: 0,
        mainsBackupDurationSeconds: 0,
        estimatedDieselLiters: 0,
        avgConsumptionPerHour: 0,
        totalAlarmsCount: 0,
        totalFaultsCount: 0,
        totalWarningsCount: 0,
        availabilityPercent: 100
    };
}

export default router;
