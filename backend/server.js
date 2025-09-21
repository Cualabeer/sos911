import express from "express";
import pkg from "pg";
import QRCode from "qrcode";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Initialize database: drop tables cascade, create tables, insert dummy data
async function initDb() {
  try {
    // Drop tables in correct order using CASCADE
    await pool.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50),
        price NUMERIC(10,2)
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id) ON DELETE CASCADE,
        booking_time TIMESTAMP NOT NULL,
        location_lat NUMERIC(9,6),
        location_lng NUMERIC(9,6),
        number_plate VARCHAR(10),
        qr_code TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        points INT DEFAULT 0
      );
    `);

    // Insert dummy services (5 categories, 6 services each = 30)
    const serviceCategories = ["Engine", "Brakes", "Electrical", "Cooling", "General"];
    let serviceCount = 1;
    for (let category of serviceCategories) {
      for (let i = 1; i <= 6; i++) {
        await pool.query(
          `INSERT INTO services (name, category, price) VALUES ($1,$2,$3)`,
          [`${category} Service ${i}`, category, (50 + i * 10).toFixed(2)]
        );
        serviceCount++;
      }
    }

    // Insert dummy customers
    const customerNames = ["Alice", "Bob", "Charlie", "Diana", "Evan", "Fiona", "George"];
    for (let name of customerNames) {
      await pool.query(
        `INSERT INTO customers (name,email,phone) VALUES ($1,$2,$3)`,
        [name, `${name.toLowerCase()}@example.com`, "07123456789"]
      );
    }

    // Insert dummy bookings
    const bookings = [
      { customer_id: 1, service_id: 1, lat: 51.386, lng: 0.521, plate: "AB12 CDE" },
      { customer_id: 2, service_id: 3, lat: 51.390, lng: 0.530, plate: "CD34 EFG" },
      { customer_id: 3, service_id: 5, lat: 51.395, lng: 0.540, plate: "EF56 HIJ" },
      { customer_id: 4, service_id: 2, lat: 51.400, lng: 0.550, plate: "GH78 KLM" },
      { customer_id: 5, service_id: 7, lat: 51.405, lng: 0.560, plate: "IJ90 NOP" },
      { customer_id: 6, service_id: 9, lat: 51.410, lng: 0.570, plate: "KL12 QRS" },
      { customer_id: 7, service_id: 11, lat: 51.415, lng: 0.580, plate: "MN34 TUV" },
    ];

    for (let b of bookings) {
      const qr = await QRCode.toDataURL(`${b.customer_id}-${b.service_id}-${Date.now()}`);
      await pool.query(
        `INSERT INTO bookings (customer_id, service_id, booking_time, location_lat, location_lng, number_plate, qr_code) 
        VALUES ($1,$2,NOW(),$3,$4,$5,$6)`,
        [b.customer_id, b.service_id, b.lat, b.lng, b.plate, qr]
      );
    }

    console.log("✅ Database initialized with dummy data.");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
}

// API routes

// DB connection status
app.get("/api/db-status", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "✅ Backend is running and DB connected!" });
  } catch (err) {
    res.json({ status: "❌ Database not connected", error: err.message });
  }
});

// Get services
app.get("/api/services", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM services ORDER BY category, name");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Book a service
app.post("/api/book", async (req, res) => {
  const { customer_id, service_id, lat, lng, number_plate } = req.body;
  if (!customer_id || !service_id || !lat || !lng || !number_plate) {
    return res.status(400).json({ error: "Missing fields" });
  }
  try {
    const qr = await QRCode.toDataURL(`${customer_id}-${service_id}-${Date.now()}`);
    const result = await pool.query(
      `INSERT INTO bookings (customer_id, service_id, booking_time, location_lat, location_lng, number_plate, qr_code) 
       VALUES ($1,$2,NOW(),$3,$4,$5,$6) RETURNING *`,
      [customer_id, service_id, lat, lng, number_plate.toUpperCase(), qr]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all bookings
app.get("/api/bookings", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, c.name AS customer_name, s.name AS service_name 
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN services s ON b.service_id = s.id
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  await initDb();
});