// server.js
import express from "express";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 3000;

// Setup database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required on Render
});

app.use(express.json());

// Serve frontend (adjust folder if needed)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../frontend")));

// ---- Initialize database ----
async function initDb() {
  try {
    // Tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        price NUMERIC(10,2)
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id) ON DELETE CASCADE,
        booking_date TIMESTAMP DEFAULT NOW(),
        location TEXT,
        vehicle_plate TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Insert dummy services
    const svcCount = await pool.query("SELECT COUNT(*) FROM services");
    if (parseInt(svcCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO services (name, description, price) VALUES
        ('Oil Change', 'Engine oil and filter replacement', 79.99),
        ('Brake Service', 'Brake pads and disc check/replacement', 149.99),
        ('Full Service', 'Comprehensive 30-point vehicle check', 249.99),
        ('Battery Replacement', 'Car battery check and replacement', 129.99),
        ('Diagnostics', 'Computer diagnostics and fault check', 59.99);
      `);
      console.log("✅ Inserted dummy services");
    }

    // Insert dummy customers & bookings
    const custCount = await pool.query("SELECT COUNT(*) FROM customers");
    if (parseInt(custCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO customers (name, email, phone) VALUES
        ('John Doe', 'john@example.com', '123456789'),
        ('Jane Smith', 'jane@example.com', '987654321'),
        ('Ali Khan', 'ali@example.com', '555666777'),
        ('Maria Lopez', 'maria@example.com', '222333444'),
        ('Tom Brown', 'tom@example.com', '111222333');
      `);
      console.log("✅ Inserted dummy customers");
    }

    const bookCount = await pool.query("SELECT COUNT(*) FROM bookings");
    if (parseInt(bookCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO bookings (customer_id, service_id, location, vehicle_plate) VALUES
        (1, 1, 'London, UK', 'AB12 CDE'),
        (2, 2, 'Manchester, UK', 'XY34 ZZZ'),
        (3, 3, 'Birmingham, UK', 'JK56 LMN'),
        (4, 4, 'Glasgow, UK', 'PQ78 RST'),
        (5, 5, 'Leeds, UK', 'UV90 WXY'),
        (1, 2, 'London, UK', 'AB12 CDE'),
        (2, 3, 'Manchester, UK', 'XY34 ZZZ'),
        (3, 4, 'Birmingham, UK', 'JK56 LMN'),
        (4, 5, 'Glasgow, UK', 'PQ78 RST'),
        (5, 1, 'Leeds, UK', 'UV90 WXY');
      `);
      console.log("✅ Inserted dummy bookings");
    }

    console.log("📦 Database ready");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
}
initDb();

// ---- API ROUTES ----

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend connected" });
});

// Get all services
app.get("/api/services", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM services ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

// Get all bookings
app.get("/api/bookings", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.id, c.name AS customer, s.name AS service, b.location, b.vehicle_plate, b.booking_date
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN services s ON b.service_id = s.id
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// Add new booking
app.post("/api/bookings", async (req, res) => {
  const { customer_id, service_id, location, vehicle_plate } = req.body;
  if (!customer_id || !service_id || !location || !vehicle_plate) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO bookings (customer_id, service_id, location, vehicle_plate)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [customer_id, service_id, location, vehicle_plate.toUpperCase()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create booking" });
  }
});

// Fallback → serve index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});