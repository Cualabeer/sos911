import express from "express";
import cors from "cors";
import { Pool } from "pg";
import dotenv from "dotenv";
import QRCode from "qrcode";
import bodyParser from "body-parser";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Render requires SSL
});

// --- DATABASE INIT FUNCTION ---
async function initDb() {
  try {
    // Drop all tables first
    await pool.query(`
      DROP TABLE IF EXISTS job_notes CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS parts CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        vehicle_plate TEXT NOT NULL,
        date TIMESTAMP NOT NULL,
        location TEXT NOT NULL,
        qr_code TEXT
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      );

      CREATE TABLE job_notes (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES bookings(id),
        note TEXT
      );

      CREATE TABLE parts (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES bookings(id),
        part_name TEXT,
        cost NUMERIC(10,2)
      );
    `);

    console.log("✅ Tables created");

    // Insert dummy data
    await pool.query(`
      INSERT INTO customers (name, phone, email) VALUES
        ('Alice Smith','+447700900001','alice@example.com'),
        ('Bob Jones','+447700900002','bob@example.com'),
        ('Charlie Brown','+447700900003','charlie@example.com');

      INSERT INTO services (name, description, price) VALUES
        ('Oil Change','Full synthetic oil change',50.00),
        ('Brake Service','Brake pads and discs',120.00),
        ('Battery Replacement','Replacement with new battery',80.00);

      INSERT INTO bookings (customer_id, service_id, vehicle_plate, date, location) VALUES
        (1,1,'AB12CDE',NOW(),'Medway ME1'),
        (2,2,'CD34EFG',NOW(),'Medway ME2'),
        (3,3,'EF56HIJ',NOW(),'Medway ME3');

      INSERT INTO loyalty (customer_id, points) VALUES
        (1,5),(2,2),(3,0);

      INSERT INTO job_notes (booking_id,note) VALUES
        (1,'Check oil filter'),
        (2,'Check brake fluid'),
        (3,'Check battery terminals');

      INSERT INTO parts (booking_id, part_name, cost) VALUES
        (1,'Oil Filter',15.00),
        (2,'Brake Pads',45.00),
        (3,'Battery',70.00);
    `);

    // Generate QR codes for bookings
    const bookings = await pool.query("SELECT id FROM bookings");
    for (let row of bookings.rows) {
      const qrData = `booking-${row.id}`;
      const qrImage = await QRCode.toDataURL(qrData);
      await pool.query("UPDATE bookings SET qr_code=$1 WHERE id=$2", [qrImage, row.id]);
    }

    console.log("✅ Dummy data inserted and QR codes generated");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
}

// --- API ENDPOINTS ---

app.get("/api/customers", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM customers");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/services", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM services");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bookings", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM bookings");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/loyalty", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM loyalty");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diagnostics endpoint
app.get("/api/diagnostics", async (req, res) => {
  try {
    const dbRes = await pool.query("SELECT COUNT(*) FROM customers");
    const dbStatus = dbRes.rows ? "Connected" : "Failed";
    res.json({
      database: dbStatus,
      customers: dbRes.rows[0].count
    });
  } catch (err) {
    res.json({ database: "FAIL", error: err.message });
  }
});

// --- START SERVER ---
app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  await initDb();
});