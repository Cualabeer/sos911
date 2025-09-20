import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;

// Use Render's DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Init DB: create tables + insert dummy data if missing
async function initDb() {
  const client = await pool.connect();
  try {
    console.log("⏳ Setting up database...");

    // Customers
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20)
      );
    `);

    // Mechanics
    await client.query(`
      CREATE TABLE IF NOT EXISTS mechanics (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        specialization VARCHAR(100)
      );
    `);

    // Services
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        description TEXT,
        price NUMERIC
      );
    `);

    // Bookings
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        service_id INT REFERENCES services(id) ON DELETE CASCADE,
        mechanic_id INT REFERENCES mechanics(id) ON DELETE SET NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        location TEXT,
        status VARCHAR(50) DEFAULT 'pending'
      );
    `);

    // Insert dummy services (only if empty)
    const { rows: serviceCount } = await client.query(`SELECT COUNT(*) FROM services`);
    if (parseInt(serviceCount[0].count) === 0) {
      await client.query(`
        INSERT INTO services (name, description, price) VALUES
        ('Oil Change', 'Engine oil & filter replacement', 79.99),
        ('Brake Service', 'Pads, discs check and replacement', 149.99),
        ('Battery Replacement', 'Remove old, fit new battery', 120.00),
        ('Diagnostic Check', 'Full OBD diagnostic scan', 59.99),
        ('Full Service', 'Comprehensive yearly service', 249.99);
      `);
    }

    // Insert dummy customers (only if empty)
    const { rows: custCount } = await client.query(`SELECT COUNT(*) FROM customers`);
    if (parseInt(custCount[0].count) === 0) {
      await client.query(`
        INSERT INTO customers (name, email, phone) VALUES
        ('Ali Khan', 'ali@example.com', '03001234567'),
        ('Sophie Brown', 'sophie@example.com', '07123456789'),
        ('Carlos Diaz', 'carlos@example.com', '07222333444');
      `);
    }

    // Insert dummy mechanics
    const { rows: mechCount } = await client.query(`SELECT COUNT(*) FROM mechanics`);
    if (parseInt(mechCount[0].count) === 0) {
      await client.query(`
        INSERT INTO mechanics (name, specialization) VALUES
        ('John Mechanic', 'Brakes'),
        ('Sara Fixit', 'Diagnostics'),
        ('Mohammed Tools', 'General Service');
      `);
    }

    // Insert dummy bookings
    const { rows: bookingCount } = await client.query(`SELECT COUNT(*) FROM bookings`);
    if (parseInt(bookingCount[0].count) === 0) {
      await client.query(`
        INSERT INTO bookings (customer_id, service_id, mechanic_id, location, status) VALUES
        (1, 1, 1, 'London', 'completed'),
        (1, 2, 2, 'London', 'pending'),
        (2, 3, 1, 'Manchester', 'in-progress'),
        (3, 4, 3, 'Birmingham', 'pending'),
        (2, 5, 2, 'Leeds', 'completed'),
        (1, 3, 2, 'Glasgow', 'pending'),
        (3, 2, 1, 'Bradford', 'in-progress'),
        (2, 1, 3, 'Liverpool', 'completed'),
        (1, 4, 1, 'London', 'pending'),
        (3, 5, 2, 'Nottingham', 'pending');
      `);
    }

    console.log("✅ Database setup complete");
  } catch (err) {
    console.error("❌ Database init error:", err);
  } finally {
    client.release();
  }
}
initDb();

// ✅ Routes

// Health check
app.get("/", (req, res) => {
  res.json({ message: "✅ Backend is running and DB connected!" });
});

// Get all services
app.get("/services", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM services");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all bookings
app.get("/bookings", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.id, c.name AS customer, s.name AS service, m.name AS mechanic, b.date, b.location, b.status
      FROM bookings b
      LEFT JOIN customers c ON b.customer_id = c.id
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN mechanics m ON b.mechanic_id = m.id
      ORDER BY b.date DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new booking
app.post("/bookings", async (req, res) => {
  const { customer_id, service_id, mechanic_id, location } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO bookings (customer_id, service_id, mechanic_id, location, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [customer_id, service_id, mechanic_id, location]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
}); 