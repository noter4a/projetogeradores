
import pool from './src/db.js';

const checkAlarms = async () => {
    try {
        console.log("Checking Alarm History for 0x0111 (273)...");
        // Check last 20 alarms
        const res = await pool.query('SELECT id, generator_id, alarm_code, start_time, end_time, acknowledged FROM alarm_history ORDER BY id DESC LIMIT 20');
        console.table(res.rows.map(r => ({
            id: r.id,
            code: r.alarm_code,
            start: r.start_time.toISOString(),
            end: r.end_time ? r.end_time.toISOString() : 'ACTIVE',
            ack: r.acknowledged
        })));
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
};
checkAlarms();
