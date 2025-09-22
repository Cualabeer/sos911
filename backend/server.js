import express from "express";
import cors from "cors";
import helmet from "helmet";
import xss from "xss-clean";
import dotenv from "dotenv";
import { Pool } from "pg";
import QRCode from "qrcode";
import bcrypt from "bcrypt";
import Joi from "joi";

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

// ---------------- Validation Schemas ----------------
const registerSchema = Joi.object({
  name: Joi.string().max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// ---------------- Initialize DB ----------------
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`DROP TABLE IF EXISTS bookings CASCADE`);
    await client.query(`DROP TABLE IF EXISTS services CASCADE`);
    await client.query(`DROP TABLE IF EXISTS customers CASCADE`);

    await client.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50),
        email VARCHAR(50) UNIQUE,
        password VARCHAR(255),
        cars TEXT[],
        points INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50),
        description TEXT,
        category VARCHAR(50)
      );
    `);

    await client.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        qr_code TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Dummy services
    await client.query(`
      INSERT INTO services (name, description, category) VALUES
      ('Oil Change', 'Full synthetic oil change', 'Maintenance'),
      ('Brake Inspection', 'Check and adjust brakes', 'Maintenance'),
      ('Battery Replacement', 'Replace old battery', 'Repair')
    `);

    console.log("✅ Database initialized");
  } catch (err) {
    console.error("❌ DB Init Error:", err.message);
  } finally {
    client.release();
  }
}

// ---------------- Routes ----------------

// Get all services
app.get("/api/services", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM services ORDER BY id ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer register
app.post("/api/customers/register", async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const hashedPassword = await bcrypt.hash(value.password, 10);
    const result = await pool.query(
      "INSERT INTO customers (name,email,password,cars) VALUES ($1,$2,$3,$4) RETURNING id,name,email,cars,points",
      [value.name, value.email, hashedPassword, []]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer login
app.post("/api/customers/login", async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const { rows } = await pool.query("SELECT * FROM customers WHERE email=$1", [value.email]);
    if (!rows[0]) return res.status(400).json({ error: "Email not found" });

    const match = await bcrypt.compare(value.password, rows[0].password);
    if (!match) return res.status(400).json({ error: "Incorrect password" });

    const { id, name, email, cars, points } = rows[0];
    res.json({ id, name, email, cars, points });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get customer bookings
app.get("/api/customers/:id/bookings", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT b.id, b.status, s.name as service_name FROM bookings b
       JOIN services s ON s.id=b.service_id
       WHERE b.customer_id=$1 ORDER BY b.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create booking with QR
app.post("/api/bookings", async (req, res) => {
  const { customer_id, service_id } = req.body;
  if (!customer_id || !service_id) return res.status(400).json({ error: "Missing fields" });

  try {
    const qr_data = `booking:${customer_id}:${service_id}:${Date.now()}`;
    const qr_code = await QRCode.toDataURL(qr_data);
    const { rows } = await pool.query(
      "INSERT INTO bookings (customer_id,service_id,qr_code) VALUES ($1,$2,$3) RETURNING id,status,qr_code",
      [customer_id, service_id, qr_code]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Start Server ----------------
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});