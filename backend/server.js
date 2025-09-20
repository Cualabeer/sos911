import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// PostgreSQL setup
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  try {
    // Drop tables with CASCADE to avoid foreign key errors
    await pool.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);

    // Customers table
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20)
      );
    `);

    // Services table
    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price NUMERIC(10,2) NOT NULL
      );
    `);

    // Bookings table
    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        number_plate VARCHAR(10),
        location TEXT,
        scheduled_time TIMESTAMP,
        qr_code TEXT,
        status VARCHAR(20) DEFAULT 'pending'
      );
    `);

    // Loyalty table
    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        visits INT DEFAULT 0,
        free_service_available BOOLEAN DEFAULT false
      );
    `);

    // Dummy data
    await pool.query(`
      INSERT INTO customers (name, email, phone) VALUES
      ('Alice Smith','alice@test.com','+447400000001'),
      ('Bob Jones','bob@test.com','+447400000002'),
      ('Charlie Brown','charlie@test.com','+447400000003');

      INSERT INTO services (name, price) VALUES
      ('Oil Change',50.00),
      ('Brake Check',35.00),
      ('Tyre Replacement',80.00),
      ('Battery Test',25.00),
      ('Aircon Service',60.00);

      INSERT INTO bookings (customer_id, service_id, number_plate, location, scheduled_time, qr_code) VALUES
      (1,1,'AB12CDE','123 Main St, Medway',NOW(),'QR1'),
      (2,2,'CD34EFG','456 High St, Medway',NOW(),'QR2'),
      (3,3,'GH56IJK','789 Park Ave, Medway',NOW(),'QR3');

      INSERT INTO loyalty (customer_id, visits, free_service_available) VALUES
      (1,3,false),
      (2,5,true),
      (3,2,false);
    `);

    console.log('✅ Database initialized with dummy data!');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// API endpoint to check DB status
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM customers');
    res.json({ status: 'connected', customers: result.rows[0].count });
  } catch (err) {
    res.json({ status: 'error', error: err.message });
  }
});

// Fallback to frontend index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});