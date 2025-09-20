// server.js
import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import crypto from 'crypto';

const app = express();
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Generate unique QR code
function generateQR() {
  return crypto.randomBytes(8).toString('hex'); // 16-char code
}

// Initialize database and ensure qr_code column exists
async function initDb() {
  try {
    // Create bookings table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        customer_name TEXT,
        vehicle_reg TEXT,
        service_name TEXT,
        location TEXT,
        status TEXT DEFAULT 'pending',
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        parts TEXT,
        labor NUMERIC
      )
    `);

    // Check if qr_code column exists
    const colRes = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='bookings' AND column_name='qr_code'
    `);
    if (colRes.rows.length === 0) {
      await pool.query(`ALTER TABLE bookings ADD COLUMN qr_code TEXT UNIQUE`);
      console.log('qr_code column added to bookings table.');
    }

    // Add dummy data if table empty
    const res = await pool.query('SELECT COUNT(*) FROM bookings');
    if (parseInt(res.rows[0].count) === 0) {
      console.log('Adding dummy bookings...');
      for (let i = 1; i <= 10; i++) {
        await pool.query(
          `INSERT INTO bookings (customer_name, vehicle_reg, service_name, location)
           VALUES ($1,$2,$3,$4)`,
          [`Customer ${i}`, `AB12CDE${i}`, `Service ${i % 5 + 1}`, `Address ${i}`]
        );
      }
    }

    console.log('Database initialized.');
  } catch (err) {
    console.error('Database init error:', err);
  }
}

// Initialize QR codes for all bookings without one
async function initQRCodes() {
  try {
    const res = await pool.query(`SELECT id FROM bookings WHERE qr_code IS NULL`);
    for (const row of res.rows) {
      const qrCode = generateQR();
      await pool.query(`UPDATE bookings SET qr_code=$1 WHERE id=$2`, [qrCode, row.id]);
      console.log(`Booking ${row.id} QR code set: ${qrCode}`);
    }
    console.log('All missing QR codes initialized.');
  } catch (err) {
    console.error('Error initializing QR codes:', err);
  }
}

// Customer creates booking
app.post('/bookings', async (req, res) => {
  const { customer_name, vehicle_reg, service_name, location } = req.body;
  const qr_code = generateQR();
  try {
    const result = await pool.query(
      `INSERT INTO bookings (customer_name, vehicle_reg, service_name, location, qr_code)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [customer_name, vehicle_reg.toUpperCase(), service_name, location, qr_code]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Mechanic endpoints
app.get('/bookings', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, customer_name, vehicle_reg, service_name, location, status, start_time, end_time, qr_code
      FROM bookings
      ORDER BY id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/bookings/:id/start', async (req, res) => {
  const jobId = req.params.id;
  try {
    await pool.query(`UPDATE bookings SET status='in-progress', start_time=NOW() WHERE id=$1`, [jobId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post('/bookings/:id/complete', async (req, res) => {
  const jobId = req.params.id;
  const { parts, labor } = req.body;
  try {
    await pool.query(
      `UPDATE bookings SET status='completed', end_time=NOW(), parts=$1, labor=$2 WHERE id=$3`,
      [parts || 'N/A', labor || 0, jobId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post('/bookings/:id/override', async (req, res) => {
  const jobId = req.params.id;
  const { code } = req.body;
  if(!code) return res.status(400).json({ success:false, error:"Missing override code" });
  try {
    await pool.query(
      `UPDATE bookings SET status='in-progress', start_time=NOW() WHERE id=$1`,
      [jobId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initDb();      // Create table + dummy data if empty
  await initQRCodes(); // Generate QR codes for existing bookings
  console.log('✅ Backend is running and DB connected!');
});