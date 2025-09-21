import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';
import QRCode from 'qrcode';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const app = express();
app.use(cors());
app.use(express.json());

// Health check / DB status
app.get('/api/status', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ db: 'connected', message: '✅ Backend is running and DB connected!' });
  } catch (err) {
    res.status(500).json({ db: 'error', message: `❌ Database not connected: ${err.message}` });
  }
});

// Initialize DB: drop tables, create new tables, insert dummy data
async function initDb() {
  try {
    // Drop tables if exist (order matters)
    await pool.query(`
      DROP TABLE IF EXISTS loyalty;
      DROP TABLE IF EXISTS bookings;
      DROP TABLE IF EXISTS customers;
      DROP TABLE IF EXISTS services;
    `);

    // Customers table
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Services table
    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50),
        name VARCHAR(100),
        price NUMERIC(10,2)
      );
    `);

    // Bookings table
    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        date TIMESTAMP,
        location TEXT,
        number_plate VARCHAR(10),
        qr_code TEXT,
        status VARCHAR(20) DEFAULT 'pending'
      );
    `);

    // Loyalty table
    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      );
    `);

    // Insert dummy services
    await pool.query(`
      INSERT INTO services (category, name, price) VALUES
      ('Engine', 'Oil Change', 50),
      ('Engine', 'Spark Plug Replacement', 80),
      ('Engine', 'Timing Belt', 200),
      ('Brakes', 'Brake Pad Replacement', 120),
      ('Brakes', 'Brake Disc Replacement', 180),
      ('Electrical', 'Battery Replacement', 90),
      ('Electrical', 'Alternator Check', 60),
      ('Suspension', 'Shock Absorber Replacement', 150),
      ('Suspension', 'Strut Replacement', 180),
      ('Cooling', 'Radiator Replacement', 200),
      ('Cooling', 'Coolant Flush', 70);
    `);

    console.log('✅ Database initialized with tables and dummy services');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// QR code generation
async function generateQr(id) {
  try {
    return await QRCode.toDataURL(`BOOKING-${id}`);
  } catch (err) {
    console.error('Error generating QR code:', err);
    return null;
  }
}

// API endpoints

// Get all services
app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY category, name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new booking
app.post('/api/bookings', async (req, res) => {
  const { customer_name, email, phone, service_id, date, location, number_plate } = req.body;
  if (!customer_name || !service_id || !date || !location || !number_plate) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const custRes = await pool.query(
      'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING id',
      [customer_name, email, phone]
    );
    const customer_id = custRes.rows[0].id;

    const bookingRes = await pool.query(
      'INSERT INTO bookings (customer_id, service_id, date, location, number_plate) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [customer_id, service_id, date, location, number_plate.toUpperCase()]
    );

    const booking_id = bookingRes.rows[0].id;
    const qr = await generateQr(booking_id);

    await pool.query('UPDATE bookings SET qr_code=$1 WHERE id=$2', [qr, booking_id]);

    res.json({ booking_id, qr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all bookings (for admin / mechanic)
app.get('/api/bookings', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.id, c.name as customer_name, s.name as service_name, b.date, b.location, b.number_plate, b.qr_code, b.status
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN services s ON b.service_id = s.id
      ORDER BY b.date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});