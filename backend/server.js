import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

dotenv.config();

const { Pool } = pg;

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // for Render Postgres
});

// Initialize DB: drop all tables, recreate, add dummy data
async function initDb() {
  try {
    await pool.query(`DROP TABLE IF EXISTS bookings CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS loyalty CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS customers CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS services CASCADE`);

    await pool.query(`
      CREATE TABLE services(
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        description TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE customers(
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(100),
        number_plate VARCHAR(15),
        address TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE bookings(
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        latitude NUMERIC(9,6),
        longitude NUMERIC(9,6),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE loyalty(
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        completed_services INT DEFAULT 0,
        free_service_available BOOLEAN DEFAULT FALSE
      );
    `);

    // Dummy data
    await pool.query(`
      INSERT INTO services(name, description) VALUES
      ('Oil Change', 'Complete engine oil replacement'),
      ('Brake Check', 'Brake inspection and replacement'),
      ('Battery Replacement', 'Replace car battery with new one');
    `);

    await pool.query(`
      INSERT INTO customers(name, phone, email, number_plate, address) VALUES
      ('John Doe', '+447911123456', 'john@example.com', 'AB12CDE', '1 Medway Street, ME1 1AA'),
      ('Jane Smith', '+447911654321', 'jane@example.com', 'XY34ZFG', '2 Medway Avenue, ME2 2BB'),
      ('Bob Lee', '+447911987654', 'bob@example.com', 'MN56OPQ', '3 Medway Road, ME3 3CC');
    `);

    await pool.query(`
      INSERT INTO bookings(customer_id, service_id, latitude, longitude) VALUES
      (1, 1, 51.3835, 0.5150),
      (2, 2, 51.3890, 0.5200),
      (3, 3, 51.3950, 0.5250);
    `);

    await pool.query(`
      INSERT INTO loyalty(customer_id, completed_services, free_service_available) VALUES
      (1, 2, FALSE),
      (2, 5, TRUE),
      (3, 1, FALSE);
    `);

    console.log('✅ Database initialized with dummy data');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// Diagnostics endpoint
app.get('/api/full-diagnostics', async (req, res) => {
  let diagnostics = {
    db: { status: 'UNKNOWN', details: null },
    services: { status: 'UNKNOWN', count: 0 },
    bookings: { status: 'UNKNOWN', count: 0 },
    loyalty: { status: 'UNKNOWN', count: 0 },
    qr: { status: 'UNKNOWN', example: null },
    geolocation: { status: 'OK', lat: 51.3835, lng: 0.5150 } // example coords
  };

  try {
    await pool.query('SELECT 1'); // test db connection
    diagnostics.db.status = 'OK';
  } catch (err) {
    diagnostics.db.status = 'FAIL';
    diagnostics.db.details = err.message;
  }

  try {
    const s = await pool.query('SELECT COUNT(*) FROM services');
    diagnostics.services.status = 'OK';
    diagnostics.services.count = s.rows[0].count;
  } catch (err) {
    diagnostics.services.status = 'FAIL';
    diagnostics.services.details = err.message;
  }

  try {
    const b = await pool.query('SELECT COUNT(*) FROM bookings');
    diagnostics.bookings.status = 'OK';
    diagnostics.bookings.count = b.rows[0].count;
  } catch (err) {
    diagnostics.bookings.status = 'FAIL';
    diagnostics.bookings.details = err.message;
  }

  try {
    const l = await pool.query('SELECT COUNT(*) FROM loyalty');
    diagnostics.loyalty.status = 'OK';
    diagnostics.loyalty.count = l.rows[0].count;
  } catch (err) {
    diagnostics.loyalty.status = 'FAIL';
    diagnostics.loyalty.details = err.message;
  }

  // Test QR code generation
  try {
    const qr = await QRCode.toDataURL('Test QR');
    diagnostics.qr.status = 'OK';
    diagnostics.qr.example = qr;
  } catch (err) {
    diagnostics.qr.status = 'FAIL';
    diagnostics.qr.details = err.message;
  }

  res.json(diagnostics);
});

app.listen(3000, async () => {
  await initDb();
  console.log('🚀 Server running on port 3000');
});