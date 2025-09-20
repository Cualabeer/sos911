// server.js
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import QRCode from 'qrcode';

const app = express();
const port = process.env.PORT || 3000;

// Parse JSON
app.use(cors());
app.use(express.json());

// PostgreSQL pool with SSL for Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// --- Initialize DB ---
async function initDb() {
  try {
    // Drop tables if exist
    await pool.query(`DROP TABLE IF EXISTS loyalty, bookings, services, customers CASCADE`);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL
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
        vehicle TEXT NOT NULL,
        location TEXT NOT NULL,
        qr_code TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      );
    `);

    // Insert dummy services
    const services = ['Oil Change', 'Brake Repair', 'Full Service', 'Battery Replacement', 'Tyre Change'];
    for (let s of services) {
      await pool.query('INSERT INTO services(name, price) VALUES($1,$2)', [s, Math.floor(Math.random() * 200 + 50)]);
    }

    // Insert dummy customers & bookings
    for (let i = 1; i <= 5; i++) {
      const cust = await pool.query('INSERT INTO customers(name,email,phone) VALUES($1,$2,$3) RETURNING id', 
        [`Customer ${i}`, `customer${i}@mail.com`, `07123${i}45678`]);
      const serviceId = Math.floor(Math.random() * 5) + 1;
      const qrText = `BOOKING-${i}-${Date.now()}`;
      await pool.query('INSERT INTO bookings(customer_id, service_id, vehicle, location, qr_code) VALUES($1,$2,$3,$4,$5)', 
        [cust.rows[0].id, serviceId, `AB12 CDE`, `Location ${i}`, qrText]);
    }

    console.log('✅ Database initialized with dummy data');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

// --- Status endpoint ---
app.get('/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.json({ status: 'error', error: err.message });
  }
});

// --- Booking endpoint ---
app.post('/bookings', async (req, res) => {
  const { name, email, phone, vehicle, service, location } = req.body;
  if (!name || !email || !phone || !vehicle || !service || !location) {
    return res.json({ error: 'All fields are required' });
  }
  try {
    // Check if customer exists
    let custRes = await pool.query('SELECT id FROM customers WHERE email=$1', [email]);
    let custId;
    if (custRes.rows.length === 0) {
      const insertCust = await pool.query('INSERT INTO customers(name,email,phone) VALUES($1,$2,$3) RETURNING id', [name,email,phone]);
      custId = insertCust.rows[0].id;
    } else {
      custId = custRes.rows[0].id;
    }

    // Get service id
    const serviceRes = await pool.query('SELECT id FROM services WHERE name=$1', [service]);
    if(serviceRes.rows.length === 0) return res.json({ error: 'Service not found' });
    const serviceId = serviceRes.rows[0].id;

    // Generate QR
    const qrText = `BOOKING-${custId}-${Date.now()}`;

    // Insert booking
    const bookingRes = await pool.query(
      'INSERT INTO bookings(customer_id, service_id, vehicle, location, qr_code) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [custId, serviceId, vehicle, location, qrText]
    );

    res.json({ booking: bookingRes.rows[0] });
  } catch(err) {
    console.error(err);
    res.json({ error: err.message });
  }
});

// Initialize DB then start server
initDb().then(() => {
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
});