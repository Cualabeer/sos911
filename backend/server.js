import express from 'express';
import pg from 'pg';
import cors from 'cors';
import bodyParser from 'body-parser';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required by Render Postgres
});

// --- Initialize DB ---
async function initDb() {
  try {
    // Drop old tables
    await pool.query(`DROP TABLE IF EXISTS loyalty, bookings, customers, services`);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        price NUMERIC(10,2)
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        vehicle VARCHAR(20) NOT NULL,
        service VARCHAR(100) NOT NULL,
        location TEXT NOT NULL,
        qr_code TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_count INT DEFAULT 0
      );
    `);

    // Insert dummy services
    const services = [
      { name: 'Oil Change', price: 50 },
      { name: 'Brake Check', price: 80 },
      { name: 'Tire Replacement', price: 120 },
      { name: 'Battery Replacement', price: 100 },
      { name: 'Engine Diagnostic', price: 90 }
    ];
    for (let s of services) {
      await pool.query('INSERT INTO services (name, price) VALUES ($1, $2)', [s.name, s.price]);
    }

    // Insert dummy bookings (5 examples)
    const dummyBookings = [
      { name: 'John Doe', email: 'john@test.com', phone:'07123456789', vehicle:'AB12 CDE', service:'Oil Change', location:'123 Main St, Medway' },
      { name: 'Jane Smith', email: 'jane@test.com', phone:'07234567890', vehicle:'CD34 EFG', service:'Brake Check', location:'456 Elm St, Medway' },
      { name: 'Bob Brown', email: 'bob@test.com', phone:'07345678901', vehicle:'EF56 HIJ', service:'Tire Replacement', location:'789 Oak St, Medway' },
      { name: 'Alice Green', email: 'alice@test.com', phone:'07456789012', vehicle:'GH78 KLM', service:'Battery Replacement', location:'321 Pine St, Medway' },
      { name: 'Charlie Black', email: 'charlie@test.com', phone:'07567890123', vehicle:'IJ90 NOP', service:'Engine Diagnostic', location:'654 Maple St, Medway' }
    ];

    for (let b of dummyBookings) {
      const qrData = `Booking for ${b.name} - ${b.vehicle}`;
      const qr_code = await QRCode.toDataURL(qrData);
      await pool.query(
        `INSERT INTO bookings (name,email,phone,vehicle,service,location,qr_code) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [b.name,b.email,b.phone,b.vehicle,b.service,b.location,qr_code]
      );
    }

    console.log('✅ Database initialized with dummy data!');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

// --- Routes ---
app.get('/status', async (req,res)=>{
  try{
    await pool.query('SELECT 1');
    res.json({status:'ok'});
  } catch(err){
    res.json({status:'error', message: err.message});
  }
});

app.get('/services', async (req,res)=>{
  const result = await pool.query('SELECT * FROM services');
  res.json({services: result.rows});
});

app.post('/bookings', async (req,res)=>{
  const {name,email,phone,vehicle,service,location} = req.body;
  if(!name || !email || !phone || !vehicle || !service || !location){
    return res.json({error:'Missing fields'});
  }
  try{
    const qrData = `Booking for ${name} - ${vehicle}`;
    const qr_code = await QRCode.toDataURL(qrData);
    const result = await pool.query(
      `INSERT INTO bookings (name,email,phone,vehicle,service,location,qr_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name,email,phone,vehicle,service,location,qr_code]
    );
    res.json({booking: result.rows[0]});
  } catch(err){
    res.json({error:err.message});
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async ()=>{
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});