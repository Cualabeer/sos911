// backend/server.js
import express from "express";
import pg from "pg";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ✅ Initialize DB schema and dummy data
async function initDb() {
  try {
    const client = await pool.connect();

    // Drop and recreate all tables
    await client.query(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS services CASCADE;

      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT
      );

      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC NOT NULL
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        booking_date TIMESTAMP NOT NULL,
        location TEXT,
        vehicle_plate TEXT,
        status TEXT DEFAULT 'pending'
      );
    `);

    // Insert dummy customers
    await client.query(`
      INSERT INTO customers (name, phone, email) VALUES
      ('John Doe', '0711111111', 'john@example.com'),
      ('Jane Smith', '0722222222', 'jane@example.com'),
      ('Ali Khan', '0733333333', 'ali@example.com'),
      ('Maria Lopez', '0744444444', 'maria@example.com'),
      ('David Green', '0755555555', 'david@example.com');
    `);

    // Insert dummy services
    await client.query(`
      INSERT INTO services (name, price) VALUES
      ('Oil Change', 80),
      ('Brake Pads Replacement', 120),
      ('Battery Replacement', 150),
      ('Diagnostics', 50),
      ('MOT Pre-check', 60);
    `);

    // Insert dummy bookings
    await client.query(`
      INSERT INTO bookings (customer_id, service_id, booking_date, location, vehicle_plate, status) VALUES
      (1, 1, NOW() + interval '1 day', 'Chatham', 'AB12 CDE', 'pending'),
      (2, 2, NOW() + interval '2 days', 'Rochester', 'CD34 EFG', 'pending'),
      (3, 3, NOW() + interval '3 days', 'Gillingham', 'EF56 GHI', 'confirmed'),
      (4, 4, NOW() + interval '4 days', 'Strood', 'GH78 IJK', 'in-progress'),
      (5, 5, NOW() + interval '5 days', 'Rainham', 'IJ90 KLM', 'completed'),
      (1, 2, NOW() + interval '6 days', 'Medway', 'KL12 MNO', 'pending'),
      (2, 3, NOW() + interval '7 days', 'Chatham', 'MN34 OPQ', 'pending'),
      (3, 1, NOW() + interval '8 days', 'Rochester', 'OP56 QRS', 'confirmed'),
      (4, 5, NOW() + interval '9 days', 'Gillingham', 'QR78 STU', 'in-progress'),
      (5, 4, NOW() + interval '10 days', 'Strood', 'ST90 UVW', 'completed');
    `);

    client.release();
    console.log("✅ Database initialized with dummy data");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
}

initDb();

// --- API Routes ---
app.get("/", (req, res) => {
  res.send("🚀 Server running & database connected!");
});

app.get("/services", async (req, res) => {
  const result = await pool.query("SELECT * FROM services ORDER BY id");
  res.json(result.rows);
});

app.post("/bookings", async (req, res) => {
  const { customer_id, service_id, booking_date, location, vehicle_plate } = req.body;
  const result = await pool.query(
    `INSERT INTO bookings (customer_id, service_id, booking_date, location, vehicle_plate)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [customer_id, service_id, booking_date, location, vehicle_plate]
  );
  res.json(result.rows[0]);
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));