// backend/server.js
import express from "express";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import cors from "cors";
import bodyParser from "body-parser";
import { formatName, validateEmail, formatRegNumber, validateRegNumber, validateFutureDate } from "./validators.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../frontend"))); // serve frontend

// PostgreSQL connection from env variable
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ----------- DB Init -----------
async function initDb() {
  try {
    // drop all tables first
    await pool.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);

    // create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password TEXT NOT NULL
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        reg_number VARCHAR(10) NOT NULL,
        service_date DATE NOT NULL,
        qr_code TEXT
      );
    `);

    // insert dummy services
    await pool.query(`
      INSERT INTO services (name, description)
      VALUES
      ('Oil Change', 'Full oil replacement'),
      ('Brake Check', 'Check and replace brake pads'),
      ('Battery Replacement', 'Replace car battery');
    `);

    // insert dummy customers
    await pool.query(`
      INSERT INTO customers (name,email,password)
      VALUES
      ('John Doe','john@example.com','test123'),
      ('Jane Smith','jane@example.com','test123');
    `);

    // insert dummy bookings
    await pool.query(`
      INSERT INTO bookings (customer_id, service_id, reg_number, service_date)
      VALUES
      (1,1,'AB12 CDE','2025-10-01'),
      (2,2,'XY34 ZAB','2025-10-02');
    `);

    console.log("✅ Database initialized");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
}
initDb();

// ----------- Routes -----------

// Diagnostics
app.get("/api/db-status", async (req, res) => {
  try {
    const services = await pool.query("SELECT COUNT(*) FROM services");
    const bookings = await pool.query("SELECT COUNT(*) FROM bookings");
    res.json({
      db: "connected",
      services: services.rows[0].count,
      bookings: bookings.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ db: "error", error: err.message });
  }
});

// Customer registration
app.post("/api/register", async (req, res) => {
  try {
    let { name, email, password } = req.body;
    name = formatName(name);
    email = email.toLowerCase();

    if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email" });
    if (!name) return res.status(400).json({ error: "Invalid name" });
    if (password.length < 6) return res.status(400).json({ error: "Password too short" });

    await pool.query(
      "INSERT INTO customers (name,email,password) VALUES ($1,$2,$3)",
      [name, email, password]
    );
    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Booking
app.post("/api/bookings", async (req, res) => {
  try {
    let { reg_number, service_date, service_id, customer_id } = req.body;
    reg_number = formatRegNumber(reg_number);

    if (!validateRegNumber(reg_number)) return res.status(400).json({ error: "Invalid UK reg number" });
    if (!validateFutureDate(service_date)) return res.status(400).json({ error: "Invalid date" });

    // generate QR
    const qrCodeData = await QRCode.toDataURL(`${customer_id}_${service_id}_${reg_number}`);

    await pool.query(
      "INSERT INTO bookings (customer_id, service_id, reg_number, service_date, qr_code) VALUES ($1,$2,$3,$4,$5)",
      [customer_id, service_id, reg_number, service_date, qrCodeData]
    );

    res.json({ message: "Booking created", qr_code: qrCodeData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ----------- Start server -----------
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});