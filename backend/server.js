import express from "express";
import cors from "cors";
import helmet from "helmet";
import xss from "xss-clean";
import dotenv from "dotenv";
import { Pool } from "pg";
import QRCode from "qrcode";
import Joi from "joi";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(xss());

// Rate limiter
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many requests, try again later",
}));

// Serve frontend
app.use(express.static("../frontend"));

// Validation schemas
const customerSchema = Joi.object({
  name: Joi.string().max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^07\d{9}$/).required(),
  reg_plate: Joi.string().pattern(/^[A-Z]{2}\d{2} [A-Z]{3}$/).required(),
  address: Joi.string().max(100).required(),
  password: Joi.string().min(6).required(),
});

const bookingSchema = Joi.object({
  customer_id: Joi.number().required(),
  service_id: Joi.number().required(),
  location: Joi.string().required(),
  postcode: Joi.string().pattern(/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i).required(),
});

// Init DB
async function initDb() {
  const client = await pool.connect();
  try {
    // Drop all tables first
    await client.query(`DROP TABLE IF EXISTS loyalty CASCADE`);
    await client.query(`DROP TABLE IF EXISTS bookings CASCADE`);
    await client.query(`DROP TABLE IF EXISTS services CASCADE`);
    await client.query(`DROP TABLE IF EXISTS customers CASCADE`);

    // Create tables
    await client.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        email VARCHAR(50) UNIQUE NOT NULL,
        phone VARCHAR(20) NOT NULL,
        reg_plate VARCHAR(20) NOT NULL,
        address VARCHAR(100) NOT NULL,
        password VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        category VARCHAR(50) NOT NULL,
        description TEXT
      );
    `);

    await client.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id) ON DELETE CASCADE,
        location VARCHAR(100),
        postcode VARCHAR(10),
        qr_code TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        points INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Dummy data
    await client.query(`INSERT INTO services (name, category, description) VALUES 
      ('Oil Change', 'Maintenance', 'Full synthetic oil change'),
      ('Brake Inspection', 'Maintenance', 'Check and adjust brakes'),
      ('Battery Replacement', 'Repair', 'Replace old battery')
    `);

    console.log("✅ Database initialized with dummy data!");
  } catch (err) {
    console.error("❌ Database init error:", err.message);
  } finally {
    client.release();
  }
}

// Routes
app.get("/api/diagnostics", async (req,res)=>{
  try {
    const client = await pool.connect();
    const services = await client.query("SELECT COUNT(*) FROM services");
    const bookings = await client.query("SELECT COUNT(*) FROM bookings");
    const customers = await client.query("SELECT COUNT(*) FROM customers");
    client.release();
    res.json({
      db_status:"connected",
      services: services.rows[0].count,
      bookings: bookings.rows[0].count,
      customers: customers.rows[0].count
    });
  } catch(err){
    res.json({db_status:"failed",error:err.message});
  }
});

// Customer registration
app.post("/api/customers/register", async (req,res)=>{
  const {error,value} = customerSchema.validate(req.body);
  if(error) return res.status(400).json({error:error.details[0].message});

  try {
    const {name,email,phone,reg_plate,address,password} = value;
    const result = await pool.query(
      "INSERT INTO customers (name,email,phone,reg_plate,address,password) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [name,email,phone,reg_plate,address,password]
    );
    res.json(result.rows[0]);
  } catch(err){
    res.status(500).json({error:err.message});
  }
});

// Customer login
app.post("/api/customers/login", async (req,res)=>{
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM customers WHERE email=$1 AND password=$2",
      [email, password]
    );
    if(result.rows.length === 0) return res.status(401).json({error:"Invalid credentials"});
    res.json(result.rows[0]);
  } catch(err){
    res.status(500).json({error:err.message});
  }
});

// Booking service
app.post("/api/bookings", async (req,res)=>{
  const {error,value} = bookingSchema.validate(req.body);
  if(error) return res.status(400).json({error:error.details[0].message});

  try {
    const {customer_id,service_id,location,postcode} = value;
    const qr_data = `booking:${customer_id}:${service_id}:${Date.now()}`;
    const qr_code = await QRCode.toDataURL(qr_data);

    const result = await pool.query(
      "INSERT INTO bookings (customer_id,service_id,location,postcode,qr_code) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [customer_id,service_id,location,postcode,qr_code]
    );
    res.json({...result.rows[0], qr_code});
  } catch(err){
    res.status(500).json({error:err.message});
  }
});

// Get customer bookings
app.get("/api/bookings/:customer_id", async (req,res)=>{
  const {customer_id} = req.params;
  try {
    const result = await pool.query(
      "SELECT b.*, s.name as service_name, s.description as service_desc FROM bookings b JOIN services s ON s.id=b.service_id WHERE b.customer_id=$1 ORDER BY created_at DESC",
      [customer_id]
    );
    res.json(result.rows);
  } catch(err){
    res.status(500).json({error:err.message});
  }
});

// Start server
app.listen(PORT, async ()=>{
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});