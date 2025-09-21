import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";
import dotenv from "dotenv";
import QRCode from "qrcode";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(express.json());

// Fix __dirname in ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ------------------- DB INIT -------------------
async function initDb() {
  const client = await pool.connect();
  try {
    console.log("⏳ Resetting database...");
    await client.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;

      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(20)
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id),
        number_plate VARCHAR(10),
        location TEXT,
        scheduled_time TIMESTAMP,
        qr_code TEXT
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        points INT DEFAULT 0
      );
    `);

    console.log("✅ Tables created");

    // Seed services
    await client.query(`
      INSERT INTO services (name, description) VALUES
      ('Oil Change', 'Engine oil and filter replacement'),
      ('Brake Service', 'Brake pads and discs check'),
      ('Battery Replacement', 'Battery test and replacement'),
      ('Tyre Replacement', 'Tyre fitting and balancing'),
      ('Full Service', 'Comprehensive vehicle service');
    `);

    // Seed customers
    const { rows: cust } = await client.query(`
      INSERT INTO customers (name, email, phone) VALUES
      ('John Doe', 'john@example.com', '07111111111'),
      ('Jane Smith', 'jane@example.com', '07222222222'),
      ('Ali Khan', 'ali@example.com', '07333333333')
      RETURNING *;
    `);

    // Seed bookings with QR
    for (let i = 0; i < 10; i++) {
      const customer = cust[i % cust.length];
      const serviceId = (i % 5) + 1;
      const plate = `AB${i + 10} CDE`;
      const qr = await QRCode.toDataURL(`BOOKING-${i + 1}-${plate}`);

      await client.query(
        `INSERT INTO bookings (customer_id, service_id, number_plate, location, scheduled_time, qr_code)
         VALUES ($1, $2, $3, $4, NOW() + interval '1 day' * $5, $6)`,
        [customer.id, serviceId, plate, "London, UK", i, qr]
      );
    }

    console.log("✅ Dummy data inserted");
  } catch (err) {
    console.error("❌ DB init error:", err);
  } finally {
    client.release();
  }
}
initDb();

// ------------------- ROUTES -------------------

// Check DB
app.get("/api/status", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({ connected: true, message: "✅ Database connected" });
  } catch {
    res.status(500).json({ connected: false, message: "❌ Database not connected" });
  }
});

// Book service
app.post("/api/book", async (req, res) => {
  try {
    let { name, email, phone, service_id, number_plate, location, scheduled_time } = req.body;

    if (!name || !email || !service_id || !number_plate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate UK number plate (basic regex)
    number_plate = number_plate.toUpperCase();
    const plateRegex = /^[A-Z]{2}[0-9]{2}\s?[A-Z]{3}$/;
    if (!plateRegex.test(number_plate)) {
      return res.status(400).json({ error: "Invalid UK number plate format" });
    }

    // Ensure customer exists
    const { rows: existing } = await pool.query("SELECT * FROM customers WHERE email=$1", [email]);
    let customerId;
    if (existing.length > 0) {
      customerId = existing[0].id;
    } else {
      const { rows } = await pool.query(
        "INSERT INTO customers (name, email, phone) VALUES ($1,$2,$3) RETURNING id",
        [name, email, phone]
      );
      customerId = rows[0].id;
    }

    // QR code
    const qr = await QRCode.toDataURL(`BOOKING-${Date.now()}-${number_plate}`);

    // Insert booking
    await pool.query(
      `INSERT INTO bookings (customer_id, service_id, number_plate, location, scheduled_time, qr_code)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [customerId, service_id, number_plate, location, scheduled_time, qr]
    );

    res.json({ success: true, qr });
  } catch (err) {
    console.error("Booking failed:", err);
    res.status(500).json({ error: "Booking failed" });
  }
});

// List bookings
app.get("/api/bookings", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.id, c.name, c.email, s.name AS service, b.number_plate, b.location, b.scheduled_time
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN services s ON b.service_id = s.id
      ORDER BY b.id DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ------------------- START -------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));