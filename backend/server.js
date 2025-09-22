import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// PostgreSQL pool
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Utility to test DB connection
async function testDb() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (err) {
    return err.message;
  }
}

// Initialize DB: drop tables, create tables, insert dummy data
async function initDb() {
  const client = await pool.connect();
  try {
    // Drop all dependent tables
    await client.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
    `);

    // Create tables
    await client.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(100) UNIQUE,
        loyalty_points INT DEFAULT 0
      );
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50),
        description TEXT
      );
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        reg VARCHAR(10) NOT NULL,
        address TEXT,
        lat FLOAT,
        lng FLOAT,
        qr_code TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      );
    `);

    // Insert dummy data
    await client.query(`
      INSERT INTO customers (name, phone, email, loyalty_points)
      VALUES 
        ('John Doe','07700123456','john@example.com',10),
        ('Jane Smith','07700987654','jane@example.com',5),
        ('Bob Johnson','07700234567','bob@example.com',0);
        
      INSERT INTO services (name, category, description)
      VALUES 
        ('Oil Change','Maintenance','Full synthetic oil change'),
        ('Brake Check','Inspection','Check and replace brake pads if needed'),
        ('Battery Replacement','Maintenance','Replace car battery with warranty');
        
      INSERT INTO bookings (customer_id, service_id, reg, address, lat, lng)
      VALUES
        (1,1,'AB12CDE','1 High Street, Medway',51.378,-0.523),
        (2,2,'XY34ZGH','2 Station Road, Medway',51.383,-0.515),
        (3,3,'MN56OPQ','3 Market Street, Medway',51.374,-0.529);
    `);

    console.log('✅ Database initialized with dummy data!');
  } catch (err) {
    console.error('❌ Database init error:', err);
  } finally {
    client.release();
  }
}

// Diagnostics route
app.get('/api/diagnostics', async (req, res) => {
  const dbStatus = await testDb();
  res.json({
    database: dbStatus === true ? 'OK' : `FAIL: ${dbStatus}`,
    servicesAPI: 'OK',
    bookingsAPI: 'OK',
    qrCode: 'OK'
  });
});

// Booking endpoint
app.post('/api/bookings', async (req, res) => {
  const { customer_id, service_id, reg, address, lat, lng } = req.body;
  if (!customer_id || !service_id || !reg) return res.status(400).json({ error: 'Missing fields' });
  try {
    const qr = await QRCode.toDataURL(reg.toUpperCase());
    await pool.query(
      `INSERT INTO bookings (customer_id, service_id, reg, address, lat, lng, qr_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [customer_id, service_id, reg.toUpperCase(), address, lat, lng, qr]
    );
    res.json({ success: true, qr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Services list
app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bookings list
app.get('/api/bookings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bookings');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb(); // Initialize DB on start
});