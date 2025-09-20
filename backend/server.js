import express from 'express';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Serve frontend ---
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- PostgreSQL connection ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- Status route ---
app.get('/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.json({ status: 'error' });
  }
});

// --- Services route ---
app.get('/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT name, price FROM services');
    res.json({ services: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bookings route ---
app.post('/bookings', async (req, res) => {
  const { name, email, phone, vehicle, service, location } = req.body;
  if (!name || !email || !phone || !vehicle || !service || !location) {
    return res.json({ error: 'Missing fields' });
  }
  try {
    // Insert booking
    const result = await pool.query(
      'INSERT INTO bookings(name,email,phone,vehicle,service,location) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [name,email,phone,vehicle,service,location]
    );

    const bookingId = result.rows[0].id;
    const qrData = `Booking ID: ${bookingId}\nName: ${name}\nVehicle: ${vehicle}`;
    const qrCode = await QRCode.toDataURL(qrData);

    // Save QR code in DB
    await pool.query('UPDATE bookings SET qr_code=$1 WHERE id=$2', [qrCode, bookingId]);

    res.json({ booking: { id: bookingId, qr_code: qrCode } });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));