import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

dotenv.config();

const { Pool } = pg;
const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initDb() {
  try {
    // Drop all tables first
    await pool.query(`
      DROP TABLE IF EXISTS loyalty CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        phone VARCHAR(20) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id) ON DELETE CASCADE,
        number_plate VARCHAR(15) NOT NULL,
        address TEXT NOT NULL,
        lat NUMERIC(10,6),
        lng NUMERIC(10,6),
        qr_code TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        points INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Database tables created successfully.');

    // Insert dummy services
    const services = [
      { name: 'Oil Change', category: 'Engine', description: 'Full engine oil replacement', price: 49.99 },
      { name: 'Brake Pad Replacement', category: 'Brakes', description: 'Replace front & rear brake pads', price: 89.99 },
      { name: 'Battery Check', category: 'Electrical', description: 'Check & replace battery if needed', price: 39.99 },
    ];

    for (const s of services) {
      await pool.query(
        'INSERT INTO services (name, category, description, price) VALUES ($1, $2, $3, $4)',
        [s.name, s.category, s.description, s.price]
      );
    }

    console.log('✅ Dummy services inserted.');

    // Insert dummy customers
    const customers = [
      { name: 'John Doe', email: 'john@example.com', phone: '07123456789', password: 'hashedpass1' },
      { name: 'Jane Smith', email: 'jane@example.com', phone: '07234567890', password: 'hashedpass2' },
      { name: 'Bob Brown', email: 'bob@example.com', phone: '07345678901', password: 'hashedpass3' },
    ];

    for (const c of customers) {
      await pool.query(
        'INSERT INTO customers (name, email, phone, password) VALUES ($1, $2, $3, $4)',
        [c.name, c.email, c.phone, c.password]
      );
    }

    console.log('✅ Dummy customers inserted.');

    // Insert dummy bookings with QR codes
    const bookings = [
      { customer_id: 1, service_id: 1, number_plate: 'AB12CDE', address: '10 High Street, Medway', lat: 51.3860, lng: 0.5230 },
      { customer_id: 2, service_id: 2, number_plate: 'XY34ZUV', address: '20 Main Road, Medway', lat: 51.3810, lng: 0.5280 },
      { customer_id: 3, service_id: 3, number_plate: 'LM56NOP', address: '5 Station Lane, Medway', lat: 51.3835, lng: 0.5295 },
    ];

    for (const b of bookings) {
      const qrCodeData = `Booking:${b.customer_id}-${b.service_id}-${b.number_plate}`;
      const qr_code = await QRCode.toDataURL(qrCodeData);
      await pool.query(
        `INSERT INTO bookings (customer_id, service_id, number_plate, address, lat, lng, qr_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [b.customer_id, b.service_id, b.number_plate, b.address, b.lat, b.lng, qr_code]
      );
    }

    console.log('✅ Dummy bookings with QR codes inserted.');

  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

app.get('/db-status', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'connected' });
  } catch (err) {
    res.json({ status: 'error', error: err.message });
  }
});

app.get('/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/bookings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bookings');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, async () => {
  console.log('🚀 Server running on port 3000');
  await initDb();
});