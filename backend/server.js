import express from "express";
import pkg from "pg";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";

const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 3000;

// Path helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend"))); // Serve frontend

// DB setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize DB (drop all → recreate with CASCADE)
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Drop all tables
    await client.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
    `);

    // Create tables
    await client.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        address TEXT,
        postcode TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id) ON DELETE CASCADE,
        number_plate VARCHAR(10) NOT NULL,
        latitude NUMERIC,
        longitude NUMERIC,
        status TEXT DEFAULT 'Pending',
        qr_code TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        points INT DEFAULT 0
      );
    `);

    // Insert dummy services (30 across 5 categories)
    const services = [
      ["Engine", "Oil Change", 70],
      ["Engine", "Full Service", 250],
      ["Engine", "Timing Belt Replacement", 400],
      ["Engine", "Spark Plug Replacement", 90],
      ["Engine", "Coolant Flush", 80],
      ["Brakes", "Brake Pad Replacement", 150],
      ["Brakes", "Brake Disc Replacement", 220],
      ["Brakes", "Brake Fluid Change", 100],
      ["Brakes", "Handbrake Adjustment", 60],
      ["Brakes", "ABS Diagnostics", 120],
      ["Suspension", "Shock Absorber Replacement", 300],
      ["Suspension", "Spring Replacement", 250],
      ["Suspension", "Bushes Replacement", 180],
      ["Suspension", "Steering Alignment", 90],
      ["Suspension", "Ball Joint Replacement", 160],
      ["Exhaust", "Exhaust Repair", 200],
      ["Exhaust", "Catalytic Converter Replacement", 450],
      ["Exhaust", "Oxygen Sensor Replacement", 180],
      ["Exhaust", "Exhaust Mounts Replacement", 70],
      ["Exhaust", "DPF Cleaning", 300],
      ["Electrical", "Battery Replacement", 120],
      ["Electrical", "Alternator Replacement", 350],
      ["Electrical", "Starter Motor Replacement", 280],
      ["Electrical", "Headlight Replacement", 90],
      ["Electrical", "Fuse Box Diagnostics", 150],
      ["Heating/AC", "AC Re-Gas", 80],
      ["Heating/AC", "Heater Fan Replacement", 200],
      ["Heating/AC", "Air Filter Change", 40],
      ["Heating/AC", "Cabin Filter Replacement", 50],
      ["Heating/AC", "AC Compressor Replacement", 500]
    ];
    for (const [cat, name, price] of services) {
      await client.query(
        "INSERT INTO services (category, name, price) VALUES ($1,$2,$3)",
        [cat, name, price]
      );
    }

    // Dummy customers & bookings (Medway)
    const cust = await client.query(
      "INSERT INTO customers (name, email, phone, address, postcode) VALUES " +
        "('John Smith','john@example.com','07111111111','12 High St, Rochester','ME1 1AA')," +
        "('Emma Johnson','emma@example.com','07222222222','34 Dock Rd, Chatham','ME4 4TZ')," +
        "('Liam Brown','liam@example.com','07333333333','56 Rainham Rd, Gillingham','ME7 2YD')" +
        " RETURNING id"
    );

    for (let i = 1; i <= 7; i++) {
      const custId = cust.rows[(i - 1) % cust.rows.length].id;
      const serviceId = Math.floor(Math.random() * services.length) + 1;
      const plate = `ME${i}ABC`;
      const qr = await QRCode.toDataURL(`Booking-${i}-${plate}`);
      await client.query(
        "INSERT INTO bookings (customer_id, service_id, number_plate, latitude, longitude, status, qr_code) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [custId, serviceId, plate, 51.38 + Math.random()/100, 0.55 + Math.random()/100, "Confirmed", qr]
      );
    }

    await client.query("COMMIT");
    console.log("✅ Database initialized with dummy data");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Database init error:", err);
  } finally {
    client.release();
  }
}
initDb();

// Routes
app.get("/api/db-status", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({ connected: true, message: "✅ Database connected" });
  } catch {
    res.json({ connected: false, message: "❌ Database not connected" });
  }
});

app.get("/api/services", async (req, res) => {
  const result = await pool.query("SELECT * FROM services ORDER BY category, name");
  res.json(result.rows);
});

app.post("/api/book", async (req, res) => {
  try {
    const { name, email, phone, address, postcode, service_id, number_plate, latitude, longitude } = req.body;
    if (!name || !email || !service_id || !number_plate) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const cust = await pool.query(
      "INSERT INTO customers (name, email, phone, address, postcode) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id",
      [name, email, phone, address, postcode]
    );
    const custId = cust.rows[0].id;
    const qr = await QRCode.toDataURL(`Booking-${Date.now()}-${number_plate}`);
    const booking = await pool.query(
      "INSERT INTO bookings (customer_id, service_id, number_plate, latitude, longitude, status, qr_code) VALUES ($1,$2,$3,$4,$5,'Pending',$6) RETURNING *",
      [custId, service_id, number_plate.toUpperCase(), latitude, longitude, qr]
    );
    res.json({ success: true, booking: booking.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Booking failed", details: err.message });
  }
});

app.get("/api/bookings", async (req, res) => {
  const result = await pool.query(`
    SELECT b.id, c.name AS customer, s.name AS service, b.number_plate, b.status, b.qr_code, b.created_at
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN services s ON b.service_id = s.id
    ORDER BY b.created_at DESC
  `);
  res.json(result.rows);
});

// Serve frontend index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));