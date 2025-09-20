import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(bodyParser.json());

// PostgreSQL connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required on Render
});

// Initialize tables
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50),
        price DECIMAL(6,2)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(100),
        phone VARCHAR(20),
        vehicle_reg VARCHAR(10),
        service_id INT REFERENCES services(id),
        location TEXT,
        lat DECIMAL(10,8),
        lng DECIMAL(11,8),
        accuracy DECIMAL(6,2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Seed some services if empty
    const { rows } = await pool.query("SELECT COUNT(*) FROM services");
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO services (name, price) VALUES
        ('Oil Change', 45.00),
        ('Brake Pads', 80.00),
        ('Battery Replacement', 120.00),
        ('Diagnostics', 50.00),
        ('Tyre Change', 70.00)
      `);
    }

    console.log("✅ Database initialized");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
}

// Routes
app.get('/services', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM services ORDER BY id");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

app.post('/bookings', async (req, res) => {
  try {
    const { customer_name, phone, vehicle_reg, service_id, location, lat, lng, accuracy, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO bookings (customer_name, phone, vehicle_reg, service_id, location, lat, lng, accuracy, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [customer_name, phone, vehicle_reg, service_id, location, lat, lng, accuracy, notes]
    );
    res.json({ success: true, booking: result.rows[0] });
  } catch (err) {
    console.error("Booking insert error:", err);
    res.status(500).json({ success: false, error: "Could not create booking" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});