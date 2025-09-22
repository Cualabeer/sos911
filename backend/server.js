// backend/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import QRCode from 'qrcode';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ------------------- DATABASE CONNECTION -------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let dbConnected = false;

async function initDb() {
  try {
    // Drop all tables first (cascade)
    await pool.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(20) NOT NULL,
        registered_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        description TEXT
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id) ON DELETE CASCADE,
        number_plate VARCHAR(10) NOT NULL,
        address TEXT NOT NULL,
        latitude DECIMAL(9,6),
        longitude DECIMAL(9,6),
        qr_code TEXT,
        booked_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(20) DEFAULT 'pending'
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        points INT DEFAULT 0
      );
    `);

    // Dummy data
    const serviceData = [
      ['Oil Change', 'Maintenance', 'Full synthetic oil change'],
      ['Brake Check', 'Maintenance', 'Complete brake system inspection'],
      ['Battery Replacement', 'Electrical', 'Replace car battery'],
      ['Engine Diagnostics', 'Diagnostics', 'Full engine diagnostic scan'],
      ['AC Service', 'Comfort', 'Air conditioning service and refill'],
    ];

    for (const [name, category, description] of serviceData) {
      await pool.query(
        'INSERT INTO services(name, category, description) VALUES($1,$2,$3)',
        [name, category, description]
      );
    }

    const customerData = [
      ['Alice Smith', 'alice@example.com', '07700123456'],
      ['Bob Jones', 'bob@example.com', '07700987654'],
      ['Charlie Brown', 'charlie@example.com', '07700112233'],
    ];

    for (const [name, email, phone] of customerData) {
      await pool.query(
        'INSERT INTO customers(name,email,phone) VALUES($1,$2,$3)',
        [name, email, phone]
      );
    }

    const bookingData = [
      [1, 1, 'AB12CDE', '10 Downing St, London', 51.5034, -0.1276],
      [2, 2, 'XY34ZFG', '221B Baker St, London', 51.5237, -0.1585],
      [3, 3, 'LM56NOP', '1600 Pennsylvania Ave NW, Washington', 38.8977, -77.0365],
    ];

    for (const [custId, serviceId, plate, addr, lat, lng] of bookingData) {
      const qr = await QRCode.toDataURL(`booking:${custId}-${serviceId}`);
      await pool.query(
        'INSERT INTO bookings(customer_id, service_id, number_plate, address, latitude, longitude, qr_code) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [custId, serviceId, plate, addr, lat, lng, qr]
      );
    }

    dbConnected = true;
    console.log('✅ Database initialized and dummy data added');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// ------------------- ROUTES -------------------
app.get('/api/db-status', async (req, res) => {
  try {
    const client = await pool.connect();
    client.release();
    res.json({ status: 'connected' });
  } catch (err) {
    res.json({ status: 'error', message: err.message });
  }
});

app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT b.*, c.name as customer_name, s.name as service_name FROM bookings b JOIN customers c ON b.customer_id=c.id JOIN services s ON b.service_id=s.id'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const { customer_id, service_id, number_plate, address, latitude, longitude } = req.body;

    if (!customer_id || !service_id || !number_plate || !address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Enforce UK number plate format uppercase
    const formattedPlate = number_plate.toUpperCase();

    const qr = await QRCode.toDataURL(`booking:${customer_id}-${service_id}`);

    const result = await pool.query(
      'INSERT INTO bookings(customer_id, service_id, number_plate, address, latitude, longitude, qr_code) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [customer_id, service_id, formattedPlate, address, latitude, longitude, qr]
    );

    res.json({ bookingId: result.rows[0].id, qr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- SERVE FRONTEND -------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ------------------- START SERVER -------------------
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});