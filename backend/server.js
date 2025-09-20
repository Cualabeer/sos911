import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Pool } from 'pg';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Initialize database and dummy data
async function initDb() {
  try {
    await pool.query(`
      DROP TABLE IF EXISTS loyalty;
      DROP TABLE IF EXISTS bookings;
      DROP TABLE IF EXISTS services;
      DROP TABLE IF EXISTS customers;
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        service_id INTEGER REFERENCES services(id),
        vehicle TEXT NOT NULL,
        location TEXT NOT NULL,
        qr_code TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        service_count INTEGER DEFAULT 0
      );
    `);

    // Insert dummy services
    const services = [
      ['Oil Change', 50],
      ['Brake Repair', 120],
      ['Full Service', 250],
      ['Battery Replacement', 80],
      ['Tyre Change', 100],
      ['Air Con Service', 90],
      ['MOT Test', 70]
    ];
    for (const s of services) {
      await pool.query('INSERT INTO services(name, price) VALUES($1,$2)', s);
    }

    // Insert dummy customers and bookings
    for (let i = 1; i <= 5; i++) {
      const customerRes = await pool.query(
        'INSERT INTO customers(name,email,phone) VALUES($1,$2,$3) RETURNING id',
        [`Customer ${i}`, `customer${i}@example.com`, `070000000${i}`]
      );
      const customerId = customerRes.rows[0].id;

      // Random bookings for this customer
      for (let j = 0; j < 2; j++) {
        const serviceId = Math.floor(Math.random() * services.length) + 1;
        const vehicle = `AB12CDE`;
        const location = `Address ${i}-${j}`;
        const bookingRes = await pool.query(
          'INSERT INTO bookings(customer_id, service_id, vehicle, location) VALUES($1,$2,$3,$4) RETURNING id',
          [customerId, serviceId, vehicle, location]
        );
        const bookingId = bookingRes.rows[0].id;
        const qr = await QRCode.toDataURL(`booking:${bookingId}`);
        await pool.query('UPDATE bookings SET qr_code=$1 WHERE id=$2', [qr, bookingId]);
      }
    }

    console.log('✅ Database initialized with dummy data');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// Generate QR for a booking
async function generateQR(text) {
  try {
    return await QRCode.toDataURL(text);
  } catch (err) {
    console.error('❌ QR generation error:', err);
    return null;
  }
}

// Check DB status
app.get('/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.json({ status: 'error' });
  }
});

// Create new booking
app.post('/bookings', async (req, res) => {
  try {
    const { name, email, phone, vehicle, service, location } = req.body;
    if (!name || !email || !phone || !vehicle || !service || !location) {
      return res.json({ error: 'Missing fields' });
    }

    // Create or get customer
    let customer = await pool.query(
      'SELECT * FROM customers WHERE email=$1',
      [email]
    );
    let customerId;
    if (customer.rows.length === 0) {
      const insert = await pool.query(
        'INSERT INTO customers(name,email,phone) VALUES($1,$2,$3) RETURNING id',
        [name,email,phone]
      );
      customerId = insert.rows[0].id;
    } else {
      customerId = customer.rows[0].id;
    }

    // Get service id
    const serviceRow = await pool.query(
      'SELECT id FROM services WHERE name=$1',
      [service]
    );
    if(serviceRow.rows.length===0) return res.json({error:'Service not found'});
    const serviceId = serviceRow.rows[0].id;

    // Insert booking
    const bookingInsert = await pool.query(
      'INSERT INTO bookings(customer_id,service_id,vehicle,location) VALUES($1,$2,$3,$4) RETURNING id, created_at',
      [customerId, serviceId, vehicle.toUpperCase(), location]
    );
    const bookingId = bookingInsert.rows[0].id;

    // Generate QR
    const qr = await generateQR(`booking:${bookingId}`);
    await pool.query('UPDATE bookings SET qr_code=$1 WHERE id=$2',[qr, bookingId]);

    res.json({
      booking: {
        id: bookingId,
        customer_id: customerId,
        service_id: serviceId,
        vehicle,
        location,
        qr_code: qr,
        created_at: bookingInsert.rows[0].created_at
      }
    });
  } catch (err) {
    console.error(err);
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});