import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(bodyParser.json());

// ES modules __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// QR code generator
function generateQR() {
  return crypto.randomBytes(8).toString('hex');
}

// Reset database and populate dummy data
async function resetDatabase() {
  try {
    console.log('Resetting database...');

    // Drop tables
    await pool.query(`DROP TABLE IF EXISTS loyalty;`);
    await pool.query(`DROP TABLE IF EXISTS bookings;`);
    await pool.query(`DROP TABLE IF EXISTS services;`);
    await pool.query(`DROP TABLE IF EXISTS customers;`);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price NUMERIC(8,2) NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        vehicle_reg VARCHAR(10) NOT NULL,
        service_id INT REFERENCES services(id),
        location TEXT NOT NULL,
        qr_code VARCHAR(20) UNIQUE,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0,
        free_services INT DEFAULT 0
      );
    `);

    console.log('Tables created.');

    // Insert dummy services
    const servicesData = [
      { name: 'Oil Change', price: 50 },
      { name: 'Brake Check', price: 70 },
      { name: 'Battery Replacement', price: 120 },
      { name: 'Tire Replacement', price: 90 },
      { name: 'Full Service', price: 200 },
      { name: 'AC Service', price: 60 },
      { name: 'Wheel Alignment', price: 80 }
    ];
    for (let s of servicesData) {
      await pool.query(`INSERT INTO services (name, price) VALUES ($1, $2)`, [s.name, s.price]);
    }

    // Insert dummy customers
    const customersData = [
      { name: 'Alice', email: 'alice@test.com', phone: '07405937101' },
      { name: 'Bob', email: 'bob@test.com', phone: '07405937102' },
      { name: 'Charlie', email: 'charlie@test.com', phone: '07405937103' }
    ];
    for (let c of customersData) {
      await pool.query(`INSERT INTO customers (name, email, phone) VALUES ($1,$2,$3)`, [c.name, c.email, c.phone]);
    }

    // Insert dummy bookings with QR codes
    const dummyBookings = [
      { customer_id:1, vehicle_reg:'AB12CDE', service_id:1, location:'Medway, UK' },
      { customer_id:2, vehicle_reg:'CD34EFG', service_id:2, location:'Medway, UK' },
      { customer_id:3, vehicle_reg:'EF56HIJ', service_id:3, location:'Medway, UK' },
      { customer_id:1, vehicle_reg:'GH78JKL', service_id:4, location:'Medway, UK' },
      { customer_id:2, vehicle_reg:'IJ90KLM', service_id:5, location:'Medway, UK' }
    ];
    for (let b of dummyBookings) {
      await pool.query(
        `INSERT INTO bookings (customer_id, vehicle_reg, service_id, location, qr_code)
         VALUES ($1,$2,$3,$4,$5)`,
        [b.customer_id, b.vehicle_reg.toUpperCase(), b.service_id, b.location, generateQR()]
      );
    }

    // Insert dummy loyalty
    for (let c of customersData) {
      await pool.query(
        `INSERT INTO loyalty (customer_id, points, free_services)
         VALUES ((SELECT id FROM customers WHERE email=$1), $2, $3)`,
        [c.email, Math.floor(Math.random() * 20), 0]
      );
    }

    console.log('Dummy data inserted.');
  } catch (err) {
    console.error('Database init error:', err);
  }
}

// Customer booking endpoint
app.post('/bookings', async (req, res) => {
  try {
    const { customer_id, vehicle_reg, service_id, location } = req.body;
    if (!customer_id || !vehicle_reg || !service_id || !location) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const qr_code = generateQR();
    const result = await pool.query(
      `INSERT INTO bookings (customer_id, vehicle_reg, service_id, location, qr_code)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [customer_id, vehicle_reg.toUpperCase(), service_id, location, qr_code]
    );
    res.json({ booking: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Booking failed' });
  }
});

// Summary endpoint
app.get('/summary', async (req, res) => {
  try {
    const customers = await pool.query(`SELECT * FROM customers ORDER BY id`);
    const services = await pool.query(`SELECT * FROM services ORDER BY id`);
    const bookings = await pool.query(`
      SELECT b.id, c.name AS customer_name, b.vehicle_reg, s.name AS service_name, b.location, b.qr_code, b.status, b.created_at
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN services s ON b.service_id = s.id
      ORDER BY b.id
    `);
    const loyalty = await pool.query(`
      SELECT l.id, c.name AS customer_name, l.points, l.free_services
      FROM loyalty l
      JOIN customers c ON l.customer_id = c.id
      ORDER BY l.id
    `);

    res.json({
      customers: customers.rows,
      services: services.rows,
      bookings: bookings.rows,
      loyalty: loyalty.rows
    });
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Initialize everything
(async () => {
  await resetDatabase();
  app.listen(3000, () => console.log('🚀 Backend running on port 3000 and DB connected'));
})();