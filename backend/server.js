import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required for Render Postgres
});

const app = express();
app.use(express.json());

// Serve frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Initialize DB
async function initDb() {
  try {
    // Drop tables
    await pool.query(`DROP TABLE IF EXISTS loyalty, bookings, customers, services CASCADE`);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT
      );
      
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC NOT NULL
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        number_plate TEXT NOT NULL,
        location TEXT NOT NULL,
        booking_time TIMESTAMP DEFAULT NOW(),
        qr_code TEXT
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        services_completed INT DEFAULT 0
      );
    `);

    // Insert dummy services
    const services = [
      { name: 'Oil Change', price: 50 },
      { name: 'Brake Check', price: 70 },
      { name: 'Battery Replacement', price: 90 },
      { name: 'Tyre Replacement', price: 80 },
      { name: 'Full Service', price: 200 }
    ];

    for (const s of services) {
      await pool.query('INSERT INTO services (name, price) VALUES ($1, $2)', [s.name, s.price]);
    }

    // Insert dummy customers
    const customers = [
      { name: 'Alice', email: 'alice@test.com', phone: '07123456789' },
      { name: 'Bob', email: 'bob@test.com', phone: '07234567890' }
    ];
    for (const c of customers) {
      await pool.query('INSERT INTO customers (name, email, phone) VALUES ($1,$2,$3)', [c.name, c.email, c.phone]);
    }

    // Insert dummy bookings
    const bookings = [
      { customer_id: 1, service_id: 1, number_plate: 'AB12CDE', location: 'Medway' },
      { customer_id: 2, service_id: 2, number_plate: 'XY34ZFG', location: 'Medway' }
    ];
    for (const b of bookings) {
      const qr = await QRCode.toDataURL(`Booking:${b.customer_id}-${b.service_id}`);
      await pool.query('INSERT INTO bookings (customer_id, service_id, number_plate, location, qr_code) VALUES ($1,$2,$3,$4,$5)',
        [b.customer_id, b.service_id, b.number_plate.toUpperCase(), b.location, qr]);
    }

    console.log('✅ Database initialized with dummy data.');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// API: get services
app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: book service
app.post('/api/book', async (req, res) => {
  const { customer_id, service_id, number_plate, location } = req.body;
  if (!customer_id || !service_id || !number_plate || !location) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    const plate = number_plate.toUpperCase();
    const qr = await QRCode.toDataURL(`Booking:${customer_id}-${service_id}`);
    const result = await pool.query(
      'INSERT INTO bookings (customer_id, service_id, number_plate, location, qr_code) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [customer_id, service_id, plate, location, qr]
    );
    res.json({ booking: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: check DB connection
app.get('/api/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ connected: true });
  } catch {
    res.json({ connected: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});