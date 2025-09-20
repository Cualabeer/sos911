import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
app.use(bodyParser.json());

// Needed for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Default route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// PostgreSQL connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required on Render
});

// Initialize tables, dummy services, and bookings
async function initDb() {
  try {
    // Drop tables if they exist
    await pool.query(`DROP TABLE IF EXISTS bookings`);
    await pool.query(`DROP TABLE IF EXISTS services`);

    // Recreate services table
    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50),
        price DECIMAL(6,2)
      )
    `);

    // Recreate bookings table
    await pool.query(`
      CREATE TABLE bookings (
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

    // Insert dummy services
    await pool.query(`
      INSERT INTO services (name, price) VALUES
      ('Oil Change', 45.00),
      ('Brake Pads', 80.00),
      ('Battery Replacement', 120.00),
      ('Diagnostics', 50.00),
      ('Tyre Change', 70.00)
    `);

    // Insert 10 dummy bookings
    await pool.query(`
      INSERT INTO bookings 
      (customer_name, phone, vehicle_reg, service_id, location, lat, lng, accuracy, notes)
      VALUES
      ('Alice Smith', '07123456789', 'AB12 CDE', 1, '123 Main St, Medway', 51.3890, 0.5230, 5.0, 'Check oil level'),
      ('Bob Jones', '07234567890', 'CD34 EFG', 2, '456 High St, Medway', 51.3925, 0.5205, 4.5, 'Rear brakes'),
      ('Charlie Lee', '07345678901', 'EF56 HIJ', 3, '789 Low St, Medway', 51.3875, 0.5250, 6.0, 'Battery issue'),
      ('Dana White', '07456789012', 'GH78 KLM', 4, '101 River Rd, Medway', 51.3900, 0.5210, 5.2, 'Engine diagnostics'),
      ('Evan Black', '07567890123', 'IJ90 NOP', 5, '202 Hill Rd, Medway', 51.3910, 0.5240, 4.8, 'Tyres front'),
      ('Fiona Green', '07678901234', 'KL12 QRS', 1, '303 Oak St, Medway', 51.3880, 0.5220, 5.5, 'Oil change urgent'),
      ('George Brown', '07789012345', 'MN34 TUV', 2, '404 Pine St, Medway', 51.3920, 0.5235, 4.9, 'Brake pads rear'),
      ('Hannah Adams', '07890123456', 'OP56 WXY', 3, '505 Cedar St, Medway', 51.3895, 0.5215, 5.0, 'Battery replacement'),
      ('Ian Scott', '07901234567', 'QR78 ZAB', 4, '606 Birch St, Medway', 51.3905, 0.5225, 5.1, 'Diagnostics engine'),
      ('Jane Doe', '07012345678', 'ST90 CDE', 5, '707 Maple St, Medway', 51.3915, 0.5245, 4.7, 'Tyres all around')
    `);

    console.log("✅ Database reset, services and dummy bookings inserted");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
}

// API routes
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