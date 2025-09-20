import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Utility: Initialize DB with tables and dummy data
async function initDb() {
  try {
    // Drop tables if exist
    await pool.query(`
      DROP TABLE IF EXISTS bookings;
      DROP TABLE IF EXISTS customers;
      DROP TABLE IF EXISTS services;
      DROP TABLE IF EXISTS loyalty;
    `);

    // Customers
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT
      );
    `);

    // Services
    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC NOT NULL
      );
    `);

    // Bookings
    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        number_plate TEXT,
        location TEXT,
        qr_code TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Loyalty
    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_count INT DEFAULT 0,
        free_service BOOLEAN DEFAULT FALSE
      );
    `);

    // Dummy services
    const serviceList = [
      { name: 'Oil Change', price: 50 },
      { name: 'Brake Check', price: 70 },
      { name: 'Tyre Replacement', price: 100 },
      { name: 'Battery Replacement', price: 80 },
      { name: 'Full Service', price: 200 }
    ];
    for (const s of serviceList) {
      await pool.query('INSERT INTO services(name, price) VALUES($1,$2)', [s.name, s.price]);
    }

    // Dummy customers
    const customers = [
      { name: 'Alice', email: 'alice@test.com', phone: '07123456789' },
      { name: 'Bob', email: 'bob@test.com', phone: '07234567890' }
    ];
    for (const c of customers) {
      await pool.query('INSERT INTO customers(name,email,phone) VALUES($1,$2,$3)', [c.name, c.email, c.phone]);
    }

    console.log('✅ Database initialized with dummy data.');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// QR code generator
async function generateQR(text) {
  try {
    return await QRCode.toDataURL(text);
  } catch (err) {
    console.error('❌ QR code error:', err);
    return null;
  }
}

// API Endpoints

// Status check
app.get('/api/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ connected: true });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

// Get services
app.get('/api/services', async (req, res) => {
  const result = await pool.query('SELECT * FROM services');
  res.json(result.rows);
});

// Book a service
app.post('/api/book', async (req, res) => {
  const { name, email, phone, numberPlate, serviceId, location } = req.body;
  if (!name || !numberPlate || !serviceId || !location) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Add customer
    const custRes = await pool.query(
      'INSERT INTO customers(name,email,phone) VALUES($1,$2,$3) RETURNING id',
      [name, email, phone]
    );
    const customerId = custRes.rows[0].id;

    // Generate QR code
    const qrCode = await generateQR(`${customerId}-${serviceId}-${Date.now()}`);

    // Add booking
    const bookingRes = await pool.query(
      `INSERT INTO bookings(customer_id, service_id, number_plate, location, qr_code)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [customerId, serviceId, numberPlate.toUpperCase(), location, qrCode]
    );

    res.json({ success: true, bookingId: bookingRes.rows[0].id, qrCode });
  } catch (err) {
    console.error('❌ Booking error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Catch-all to serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});