// backend/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import xss from "xss-clean";
import dotenv from "dotenv";
import { Pool } from "pg";
import QRCode from "qrcode";
import Joi from "joi";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";

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

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many requests, try again later",
});
app.use(limiter);

// Serve frontend
app.use(express.static("../frontend"));

// Validation schemas
const customerSchema = Joi.object({
  name: Joi.string().max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().pattern(/^07\d{9}$/).required(),
  reg_plate: Joi.string().pattern(/^[A-Z]{2}\d{2} [A-Z]{3}$/).required(),
  address: Joi.string().max(100).required(),
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
    await client.query(`DROP TABLE IF EXISTS loyalty CASCADE`);
    await client.query(`DROP TABLE IF EXISTS bookings CASCADE`);
    await client.query(`DROP TABLE IF EXISTS services CASCADE`);
    await client.query(`DROP TABLE IF EXISTS customers CASCADE`);

    await client.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        email VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(200) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        reg_plate VARCHAR(20) NOT NULL,
        address VARCHAR(100) NOT NULL,
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

    // Insert default services
    await client.query(`INSERT INTO services (name, category, description) VALUES 
      ('Oil Change', 'Maintenance', 'Full synthetic oil change'),
      ('Brake Inspection', 'Maintenance', 'Check and adjust brakes'),
      ('Battery Replacement', 'Repair', 'Replace old battery')
    `);

    console.log("✅ Database initialized!");
  } catch (err) {
    console.error("❌ DB init error:", err.message);
  } finally {
    client.release();
  }
}

// Routes

// Diagnostics
app.get("/api/diagnostics", async (req, res) => {
  try {
    const client = await pool.connect();
    const services = await client.query("SELECT COUNT(*) FROM services");
    const bookings = await client.query("SELECT COUNT(*) FROM bookings");
    const customers = await client.query("SELECT COUNT(*) FROM customers");
    client.release();
    res.json({
      db_status: "connected",
      services: services.rows[0].count,
      bookings: bookings.rows[0].count,
      customers: customers.rows[0].count,
    });
  } catch (err) {
    res.json({ db_status: "failed", error: err.message });
  }
});

// Customer registration
app.post("/api/customers/register", async (req, res) => {
  const { error, value } = customerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  try {
    const hashed = await bcrypt.hash(value.password, 10);
    const { name, email, phone, reg_plate, address } = value;
    const result = await pool.query(
      "INSERT INTO customers (name,email,password,phone,reg_plate,address) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,email",
      [name, email, hashed, phone, reg_plate, address]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer login
app.post("/api/customers/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM customers WHERE email=$1", [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Invalid email/password" });
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid email/password" });
    res.json({ id: user.id, name: user.name, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Book a service
app.post("/api/bookings", async (req, res) => {
  const { error, value } = bookingSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  try {
    const { customer_id, service_id, location, postcode } = value;
    const qr_data = `booking:${customer_id}:${service_id}:${Date.now()}`;
    const qr_code = await QRCode.toDataURL(qr_data);

    const result = await pool.query(
      "INSERT INTO bookings (customer_id,service_id,location,postcode,qr_code) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [customer_id, service_id, location, postcode, qr_code]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Loyalty points
app.get("/api/customers/:id/loyalty", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT points FROM loyalty WHERE customer_id=$1", [id]);
    res.json(result.rows[0] || { points: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});