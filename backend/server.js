import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";
import QRCode from "qrcode";
import jwt from "jsonwebtoken";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---- Database Initialization ----
async function initDb() {
  const client = await pool.connect();
  try {
    // Drop tables
    await client.query(`
      DROP TABLE IF EXISTS loyalty CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);

    // Create tables
    await client.query(`
      CREATE TABLE customers(
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        loyalty_points INT DEFAULT 0
      );
      
      CREATE TABLE services(
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        description TEXT
      );

      CREATE TABLE bookings(
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        reg_plate TEXT NOT NULL,
        address TEXT NOT NULL,
        latitude NUMERIC,
        longitude NUMERIC,
        qr_code TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE loyalty(
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        visits INT DEFAULT 0
      );
    `);

    // Insert dummy services
    await client.query(`
      INSERT INTO services(name, category, price, description)
      VALUES
      ('Oil Change','Maintenance',49.99,'Change engine oil and filter'),
      ('Brake Pad Replacement','Brakes',89.99,'Replace front brake pads'),
      ('Air Filter Replacement','Maintenance',29.99,'Replace air filter');
    `);

    // Insert dummy customers
    await client.query(`
      INSERT INTO customers(name,email,phone)
      VALUES
      ('John Doe','john@example.com','07123456789'),
      ('Jane Smith','jane@example.com','07234567890'),
      ('Bob Brown','bob@example.com','07345678901');
    `);

    // Insert dummy bookings
    await client.query(`
      INSERT INTO bookings(customer_id, service_id, reg_plate, address, latitude, longitude)
      VALUES
      (1,1,'AB12CDE','10 High Street, Medway',51.33,0.55),
      (2,2,'CD34EFG','22 Station Road, Medway',51.34,0.56),
      (3,3,'EF56HIJ','5 Church Lane, Medway',51.35,0.57);
    `);

    console.log("✅ Database initialized");
  } catch (err) {
    console.error("❌ Database init error:", err);
  } finally {
    client.release();
  }
}

// ---- Routes ----

// Test DB connection & diagnostics
app.get("/api/db-status", async (req,res) => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    res.json({status:"connected"});
  } catch(e) {
    res.json({status:"error", message:e.message});
  }
});

// List all services
app.get("/api/services", async (req,res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM services");
    res.json(rows);
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

// List bookings (for mechanics/admin)
app.get("/api/bookings", async (req,res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, c.name AS customer_name, s.name AS service_name
      FROM bookings b
      JOIN customers c ON b.customer_id=c.id
      JOIN services s ON b.service_id=s.id
    `);
    res.json(rows);
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

// Create booking
app.post("/api/bookings", async (req,res) => {
  try {
    const { customer_id, service_id, reg_plate, address, latitude, longitude } = req.body;

    // Basic UK validation
    if (!/^([A-Z]{2}[0-9]{2}[A-Z]{3})$/.test(reg_plate.replace(/\s/g,''))) 
      return res.status(400).json({error:"Invalid UK registration plate"});
    if (!/^07\d{9}$/.test(req.body.phone)) 
      return res.status(400).json({error:"Invalid UK phone"});
    if (!customer_id || !service_id || !address) 
      return res.status(400).json({error:"Missing fields"});

    // Generate QR
    const qr_code = await QRCode.toDataURL(`booking:${customer_id}:${service_id}:${Date.now()}`);

    const { rows } = await pool.query(`
      INSERT INTO bookings(customer_id, service_id, reg_plate, address, latitude, longitude, qr_code)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `,[customer_id, service_id, reg_plate.toUpperCase(), address, latitude, longitude, qr_code]);

    res.json({success:true, booking:rows[0]});
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

// ---- Start Server ----
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
}); 