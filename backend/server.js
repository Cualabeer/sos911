import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import pg from 'pg';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required for Render Postgres
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// -------- Database setup --------
async function initDb() {
  try {
    // Drop tables if they exist
    await pool.query(`DROP TABLE IF EXISTS loyalty`);
    await pool.query(`DROP TABLE IF EXISTS bookings`);
    await pool.query(`DROP TABLE IF EXISTS customers`);
    await pool.query(`DROP TABLE IF EXISTS services`);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(100)
      );
    `);

    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        price NUMERIC
      );
    `);

    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        number_plate VARCHAR(10),
        location TEXT,
        date TIMESTAMP,
        qr_code TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        count INT DEFAULT 0
      );
    `);

    // Insert dummy services
    const services = [
      { name: 'Oil Change', price: 49.99 },
      { name: 'Brake Service', price: 89.99 },
      { name: 'Battery Replacement', price: 129.99 },
      { name: 'Tyre Fitting', price: 39.99 },
      { name: 'Aircon Service', price: 59.99 }
    ];
    for (const s of services) {
      await pool.query(`INSERT INTO services(name, price) VALUES($1,$2)`, [s.name, s.price]);
    }

    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// -------- Routes --------

// Check DB status
app.get('/db-status', async (req,res)=>{
  try {
    await pool.query('SELECT 1');
    res.json({status:'✅ Backend is running and DB connected!'});
  } catch(e) {
    res.json({status:'❌ Database not connected', error:e.message});
  }
});

// Get all services
app.get('/services', async (req,res)=>{
  try {
    const { rows } = await pool.query('SELECT * FROM services');
    res.json(rows);
  } catch(err) {
    res.status(500).json({error:err.message});
  }
});

// Book a service
app.post('/bookings', async (req,res)=>{
  const { customer, service_id, number_plate, location, date } = req.body;
  if(!customer || !service_id || !number_plate || !location || !date){
    return res.status(400).json({error:'Missing fields'});
  }
  try {
    // Insert customer if not exists
    let cust = await pool.query('SELECT * FROM customers WHERE phone=$1', [customer.phone]);
    let customer_id;
    if(cust.rows.length === 0){
      const result = await pool.query(
        'INSERT INTO customers(name,phone,email) VALUES($1,$2,$3) RETURNING id',
        [customer.name, customer.phone, customer.email]
      );
      customer_id = result.rows[0].id;
    } else {
      customer_id = cust.rows[0].id;
    }

    // Generate QR code data
    const qr_data = `booking:${customer_id}:${service_id}:${Date.now()}`;
    const qr_code = await QRCode.toDataURL(qr_data);

    // Insert booking
    const result = await pool.query(
      `INSERT INTO bookings(customer_id, service_id, number_plate, location, date, qr_code)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [customer_id, service_id, number_plate.toUpperCase(), location, date, qr_code]
    );

    res.json({booking_id: result.rows[0].id, qr_code});
  } catch(err){
    console.error(err);
    res.status(500).json({error:err.message});
  }
});

// Catch-all to serve frontend
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// -------- Start server --------
const PORT = process.env.PORT || 3000;
app.listen(PORT, async ()=>{
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});