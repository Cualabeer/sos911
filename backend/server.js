import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import bodyParser from 'body-parser';
import pg from 'pg';
import QRCode from 'qrcode';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Database setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // put your Render DB string in env
  ssl: { rejectUnauthorized: false }          // required for Render Postgres
});

async function initDb() {
  try {
    // Drop tables first
    await pool.query(`DROP TABLE IF EXISTS bookings CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS services CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS customers CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS loyalty CASCADE`);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        reg_plate TEXT NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        status TEXT DEFAULT 'pending',
        location TEXT,
        qr_code TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      )
    `);

    // Insert dummy services
    await pool.query(`
      INSERT INTO services (name, description)
      VALUES 
      ('Oil Change','Regular oil and filter change'),
      ('Brake Inspection','Full brake system check'),
      ('Battery Replacement','Replace car battery safely')
    `);

    // Insert dummy customers
    await pool.query(`
      INSERT INTO customers (name,email,phone,reg_plate)
      VALUES 
      ('John Doe','john@test.com','07700123456','AB12CDE'),
      ('Jane Smith','jane@test.com','07700987654','XY34ZUV')
    `);

    // Insert dummy bookings
    await pool.query(`
      INSERT INTO bookings (customer_id, service_id, location)
      VALUES 
      (1,1,'Medway, UK'),
      (2,2,'Medway, UK')
    `);

    console.log('✅ Database initialized and dummy data inserted.');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

// Initialize DB on start
initDb();

// --- Routes ---
app.get('/api/db-status', async (req, res) => {
  try {
    await pool.query('SELECT 1'); // simple ping
    res.json({ status: 'connected' });
  } catch (err) {
    res.json({ status: 'failed', error: err.message });
  }
});

app.get('/api/services', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM services');
  res.json(rows);
});

app.get('/api/bookings', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM bookings');
  res.json(rows);
});

app.post('/api/book', async (req, res) => {
  try {
    const { customer_id, service_id, location } = req.body;
    if (!customer_id || !service_id || !location)
      return res.status(400).json({ error: 'Missing fields' });

    // Generate QR code
    const qrData = `Booking:${customer_id}-${service_id}-${Date.now()}`;
    const qr_code = await QRCode.toDataURL(qrData);

    const { rows } = await pool.query(
      'INSERT INTO bookings (customer_id, service_id, location, qr_code) VALUES ($1,$2,$3,$4) RETURNING *',
      [customer_id, service_id, location, qr_code]
    );

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));