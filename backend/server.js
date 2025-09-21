import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import pg from 'pg';
import QRCode from 'qrcode';

const app = express();
app.use(cors());
app.use(express.json());

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Render PostgreSQL requirement
});

// Test DB connection
pool.connect()
  .then(() => console.log("✅ Backend is running and DB connected!"))
  .catch(err => console.error("❌ Database connection error:", err));

// --- Setup Tables and Dummy Data ---
async function initDb() {
  try {
    await pool.query(`DROP TABLE IF EXISTS bookings, customers, services, loyalty CASCADE;`);

    await pool.query(`
      CREATE TABLE customers(
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(20)
      );
      CREATE TABLE services(
        id SERIAL PRIMARY KEY,
        category VARCHAR(50),
        name VARCHAR(100),
        price NUMERIC
      );
      CREATE TABLE bookings(
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        vehicle_number VARCHAR(20),
        location VARCHAR(200),
        latitude NUMERIC,
        longitude NUMERIC,
        qr_code TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE loyalty(
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        completed_jobs INT DEFAULT 0
      );
    `);

    // Insert 30 example services in 5 categories
    const categories = ['Oil & Fluids','Brakes','Engine','Electrical','Aircon'];
    for(let c of categories){
      for(let i=1;i<=6;i++){
        await pool.query(`INSERT INTO services(category,name,price) VALUES($1,$2,$3)`,
          [c, `${c} Service ${i}`, Math.floor(Math.random()*150)+50]);
      }
    }

    console.log("✅ Database initialized with dummy services!");
  } catch(err){
    console.error("❌ Database init error:", err);
  }
}

// Run initialization once
initDb();

// --- Routes ---
app.get('/services', async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM services ORDER BY category,id');
    res.json(result.rows);
  } catch(err){ res.status(500).json({error: err.message}); }
});

app.post('/book', async (req,res)=>{
  const { customer_id, service_id, vehicle_number, location, latitude, longitude } = req.body;
  if(!customer_id || !service_id || !vehicle_number || !location) 
    return res.status(400).json({error:"Missing fields"});

  try{
    const qrData = `${customer_id}-${service_id}-${Date.now()}`;
    const qr_code = await QRCode.toDataURL(qrData);

    await pool.query(`
      INSERT INTO bookings(customer_id,service_id,vehicle_number,location,latitude,longitude,qr_code)
      VALUES($1,$2,$3,$4,$5,$6,$7)
    `,[customer_id, service_id, vehicle_number.toUpperCase(), location, latitude, longitude, qr_code]);

    res.json({success:true, qr_code});
  } catch(err){
    res.status(500).json({error: err.message});
  }
});

// Check DB status for frontend footer
app.get('/dbstatus', async (req,res)=>{
  try{
    await pool.query('SELECT 1');
    res.json({connected:true});
  } catch(err){
    res.json({connected:false, error: err.message});
  }
});

app.listen(process.env.PORT || 3000, ()=>{
  console.log(`🚀 Server running on port ${process.env.PORT || 3000}`);
});