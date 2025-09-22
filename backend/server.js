import express from "express";
import cors from "cors";
import { Pool } from "pg";
import bodyParser from "body-parser";
import QRCode from "qrcode";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("../frontend")); // serve frontend folder

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Render requires SSL
});

// Database initialization
async function initDb() {
  try {
    await pool.query(`DROP TABLE IF EXISTS bookings CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS customers CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS services CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS loyalty CASCADE`);

    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        email VARCHAR(50) NOT NULL UNIQUE,
        phone VARCHAR(20) NOT NULL,
        number_plate VARCHAR(10) NOT NULL,
        address VARCHAR(150) NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        category VARCHAR(50),
        description TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending',
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        qr_code TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      )
    `);

    // Insert dummy services
    await pool.query(`
      INSERT INTO services (name, category, description)
      VALUES
      ('Oil Change', 'Maintenance', 'Full synthetic oil change for your car'),
      ('Brake Replacement', 'Maintenance', 'Replace front or rear brake pads'),
      ('Battery Replacement', 'Electrical', 'Replace car battery with guarantee')
    `);

    // Insert dummy customers
    await pool.query(`
      INSERT INTO customers (name,email,phone,number_plate,address)
      VALUES
      ('John Doe','john@example.com','07123456789','AB12CDE','10 Downing St, London'),
      ('Jane Smith','jane@example.com','07234567890','XY34ZFG','221B Baker St, London'),
      ('Bob Lee','bob@example.com','07345678901','JK56LMN','1 High St, Medway')
    `);

    // Insert dummy bookings
    await pool.query(`
      INSERT INTO bookings (customer_id, service_id, status, lat, lng)
      VALUES
      (1,1,'pending',51.3326,0.5495),
      (2,2,'pending',51.3400,0.5600),
      (3,3,'pending',51.3350,0.5550)
    `);

    // Insert dummy loyalty
    await pool.query(`
      INSERT INTO loyalty (customer_id, points)
      VALUES
      (1,10),
      (2,20),
      (3,5)
    `);

    console.log("✅ Database initialized and dummy data inserted.");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
}

initDb();

// APIs
app.get("/api/db-status", async (req,res)=>{
  try{
    await pool.query('SELECT 1');
    res.json({status:"connected"});
  } catch(err){
    res.json({status:"failed", error: err.message});
  }
});

app.get("/api/services", async (req,res)=>{
  try{
    const result = await pool.query("SELECT * FROM services");
    res.json(result.rows);
  }catch(err){
    res.status(500).json({error: err.message});
  }
});

app.get("/api/bookings", async (req,res)=>{
  try{
    const result = await pool.query("SELECT * FROM bookings");
    res.json(result.rows);
  }catch(err){
    res.status(500).json({error: err.message});
  }
});

app.post("/api/book", async (req,res)=>{
  try{
    const {customer_id, service_id, lat, lng} = req.body;
    if(!customer_id || !service_id || !lat || !lng){
      return res.status(400).json({error:"Missing fields"});
    }

    const qr = await QRCode.toDataURL(`${customer_id}-${service_id}-${Date.now()}`);
    const result = await pool.query(
      "INSERT INTO bookings (customer_id, service_id, lat, lng, qr_code) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [customer_id, service_id, lat, lng, qr]
    );
    res.json(result.rows[0]);
  }catch(err){
    res.status(500).json({error: err.message});
  }
});

// Start server
app.listen(port, ()=>console.log(`🚀 Server running on port ${port}`));