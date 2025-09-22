import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ES modules fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Postgres connection
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ------------------------
// DB INIT AND DUMMY DATA
// ------------------------
async function initDb() {
  try {
    // Drop tables if exist
    await pool.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50),
        email VARCHAR(100),
        phone VARCHAR(20)
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50),
        description TEXT
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        reg_plate VARCHAR(10),
        location VARCHAR(255),
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
      INSERT INTO customers (name,email,phone) VALUES
      ('Alice Smith','alice@example.com','07700123456'),
      ('Bob Jones','bob@example.com','07700234567'),
      ('Charlie Brown','charlie@example.com','07700345678');

      INSERT INTO services (name,description) VALUES
      ('Oil Change','Standard engine oil replacement'),
      ('Brake Service','Brake pads and discs inspection and replacement'),
      ('Battery Replacement','Replace car battery');

      INSERT INTO bookings (customer_id,service_id,reg_plate,location) VALUES
      (1,1,'AB12CDE','Medway, UK'),
      (2,2,'CD34EFG','Gillingham, UK'),
      (3,3,'EF56HIJ','Chatham, UK');

      INSERT INTO loyalty (customer_id,points) VALUES
      (1,10),(2,5),(3,0);
    `);

    console.log('✅ Database initialized with dummy data');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

// Initialize DB on start
initDb();

// ------------------------
// API ROUTES
// ------------------------

// Diagnostics
app.get('/api/status', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW()');
    res.json({
      database: 'connected',
      dbTime: dbResult.rows[0].now,
      message: '✅ Backend running and DB connected'
    });
  } catch (err) {
    res.json({ database: 'not connected', error: err.message });
  }
});

// Book a service
app.post('/api/book', async (req, res) => {
  try {
    const { customer_id, service_id, reg_plate, location } = req.body;

    if (!customer_id || !service_id || !reg_plate || !location)
      return res.status(400).json({ error: 'Missing fields' });

    // Generate QR
    const qr = await QRCode.toDataURL(`${customer_id}-${service_id}-${Date.now()}`);

    const result = await pool.query(`
      INSERT INTO bookings (customer_id, service_id, reg_plate, location, qr_code)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [customer_id, service_id, reg_plate.toUpperCase(), location, qr]
    );

    res.json({ booking: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------
// SERVE FRONTEND
// ------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ------------------------
// START SERVER
// ------------------------
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});