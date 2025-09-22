import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// --- DB INIT ---
async function initDb() {
  try {
    // Drop all tables cascade
    await pool.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(100),
        address TEXT
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        description TEXT,
        category VARCHAR(50),
        price NUMERIC(10,2)
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        location GEOGRAPHY(POINT,4326),
        qr_code TEXT
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      );
    `);

    // Insert dummy data
    await pool.query(`
      INSERT INTO customers (name, phone, email, address)
      VALUES 
        ('John Doe','+447911123456','john@example.com','1 High St, Medway'),
        ('Jane Smith','+447911654321','jane@example.com','2 Main Rd, Medway'),
        ('Bob Brown','+447912345678','bob@example.com','3 Elm St, Medway');

      INSERT INTO services (name, description, category, price)
      VALUES 
        ('Oil Change','Standard oil change','Maintenance',49.99),
        ('Brake Check','Check brakes and pads','Maintenance',39.99),
        ('Battery Replacement','Replace car battery','Repair',89.99);
      
      INSERT INTO bookings (customer_id, service_id, status, qr_code)
      VALUES 
        (1,1,'pending',''),
        (2,2,'pending',''),
        (3,3,'pending','');
    `);

    // Generate QR codes
    const bookings = await pool.query(`SELECT id FROM bookings`);
    for (const row of bookings.rows) {
      const qr = await QRCode.toDataURL(`booking-${row.id}`);
      await pool.query(`UPDATE bookings SET qr_code=$1 WHERE id=$2`, [qr, row.id]);
    }

    console.log('✅ Database initialized with dummy data and QR codes.');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// --- ROUTES ---

// Serve customer page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// DB status
app.get('/api/db-status', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'connected' });
  } catch (err) {
    res.json({ status: 'error', error: err.message });
  }
});

// Get services
app.get('/api/services', async (req, res) => {
  const services = await pool.query('SELECT * FROM services');
  res.json(services.rows);
});

// Get bookings
app.get('/api/bookings', async (req, res) => {
  const bookings = await pool.query('SELECT * FROM bookings');
  res.json(bookings.rows);
});

// Add booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { customer_id, service_id, lat, lng } = req.body;
    const qr = await QRCode.toDataURL(`booking-${customer_id}-${service_id}-${Date.now()}`);
    const result = await pool.query(
      'INSERT INTO bookings (customer_id, service_id, location, qr_code) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3,$4),4326), $5) RETURNING *',
      [customer_id, service_id, lng, lat, qr]
    );
    res.json({ success: true, booking: result.rows[0] });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// --- START SERVER ---
app.listen(3000, async () => {
  console.log('🚀 Server running on port 3000');
  await initDb();
});