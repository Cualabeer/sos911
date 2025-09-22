import express from "express";
import { Pool } from "pg";
import cors from "cors";
import QRCode from "qrcode";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Database initialization
async function initDb() {
  try {
    // Drop all tables
    await pool.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        phone VARCHAR(15) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        category VARCHAR(50),
        price NUMERIC(10,2)
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id) ON DELETE CASCADE,
        number_plate VARCHAR(10) NOT NULL,
        address TEXT NOT NULL,
        lat NUMERIC(10,6),
        lng NUMERIC(10,6),
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

    // Dummy services
    await pool.query(`
      INSERT INTO services (name, description, category, price) VALUES
      ('Oil Change', 'Full synthetic oil change', 'Maintenance', 49.99),
      ('Brake Replacement', 'Front brake pads replacement', 'Repair', 129.99),
      ('Battery Check', 'Battery health check', 'Maintenance', 29.99),
      ('Air Filter', 'Engine air filter replacement', 'Maintenance', 19.99),
      ('Coolant Flush', 'Radiator and coolant flush', 'Maintenance', 69.99)
    `);

    // Dummy customers
    await pool.query(`
      INSERT INTO customers (name, email, phone, password) VALUES
      ('John Doe','john@example.com','07123456789','password1'),
      ('Jane Smith','jane@example.com','07234567890','password2'),
      ('Bob Brown','bob@example.com','07345678901','password3')
    `);

    // Dummy bookings
    const bookings = [
      [1,1,'AB12CDE','10 Medway St, ME1 1AA',51.389,0.518,'','pending'],
      [2,2,'CD34EFG','22 Medway Rd, ME2 2BB',51.392,0.521,'','pending'],
      [3,3,'EF56GHI','35 Medway Ln, ME3 3CC',51.395,0.524,'','pending'],
      [1,2,'GH78IJK','50 Medway Ave, ME4 4DD',51.398,0.527,'','pending'],
      [2,3,'IJ90KLM','5 Medway Close, ME5 5EE',51.401,0.530,'','pending'],
      [3,1,'KL12MNO','12 Medway Park, ME6 6FF',51.404,0.533,'','pending'],
      [1,3,'MN34OPQ','20 Medway Court, ME7 7GG',51.407,0.536,'','pending']
    ];

    for (const b of bookings) {
      const qr = await QRCode.toDataURL(`${b[2]}-${Date.now()}`);
      await pool.query(
        `INSERT INTO bookings (customer_id, service_id, number_plate, address, lat, lng, qr_code, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [...b.slice(0,7), qr]
      );
    }

    console.log("✅ Database initialized with dummy data");
  } catch (err) {
    console.error("❌ Database init error:", err.message);
  }
}

initDb();

// API Routes
app.get("/api/db-status", async (req,res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status:"OK", message:"Database connected" });
  } catch (err) {
    res.json({ status:"FAIL", message:err.message });
  }
});

app.get("/api/services", async (req,res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM services");
    res.json(rows);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bookings", async (req,res) => {
  try {
    const { rows } = await pool.query("SELECT b.*, c.name AS customer_name, s.name AS service_name FROM bookings b JOIN customers c ON b.customer_id=c.id JOIN services s ON b.service_id=s.id");
    res.json(rows);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/bookings", async (req,res) => {
  try {
    const { customer_id, service_id, number_plate, address, lat, lng } = req.body;

    if(!customer_id || !service_id || !number_plate || !address) {
      return res.status(400).json({ error:"Missing fields" });
    }

    const formattedPlate = number_plate.toUpperCase().replace(/\s+/g,''); // UK style basic

    const qr = await QRCode.toDataURL(`${formattedPlate}-${Date.now()}`);

    const result = await pool.query(
      `INSERT INTO bookings (customer_id, service_id, number_plate, address, lat, lng, qr_code, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
       [customer_id, service_id, formattedPlate, address, lat, lng, qr]
    );

    res.json({ success:true, booking: result.rows[0] });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend
app.get("/", (req,res) => {
  res.sendFile(path.join(__dirname,"../frontend/index.html"));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));