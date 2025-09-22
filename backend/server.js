import express from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Utility function
const dbQuery = async (text, params) => {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
};

// Authentication middleware
const authenticate = (role) => async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== role) return res.status(403).json({ error: 'Forbidden' });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Initialize DB - drop tables cascade, create new ones, insert dummy data
const initDb = async () => {
  try {
    // Drop tables
    await dbQuery(`
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    // Create tables
    await dbQuery(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        first_time BOOLEAN DEFAULT true
      );
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        loyalty_points INT DEFAULT 0
      );
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price NUMERIC NOT NULL,
        description TEXT
      );
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        number_plate TEXT NOT NULL,
        address TEXT NOT NULL,
        latitude NUMERIC,
        longitude NUMERIC,
        qr_code TEXT,
        status TEXT DEFAULT 'pending'
      );
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      );
    `);

    // Dummy Users
    const hashPassword = async (p) => await bcrypt.hash(p, 10);
    await dbQuery(`INSERT INTO users (email,password,role) VALUES ($1,$2,$3)`, ['admin@test.com', await hashPassword('admin123'), 'admin']);
    await dbQuery(`INSERT INTO users (email,password,role) VALUES ($1,$2,$3)`, ['mechanic@test.com', await hashPassword('mech123'), 'mechanic']);

    // Dummy Customers
    await dbQuery(`INSERT INTO customers (name,phone,email) VALUES ('Alice Smith','07700111222','alice@test.com')`);
    await dbQuery(`INSERT INTO customers (name,phone,email) VALUES ('Bob Jones','07700333444','bob@test.com')`);
    await dbQuery(`INSERT INTO customers (name,phone,email) VALUES ('Charlie Brown','07700555666','charlie@test.com')`);

    // Dummy Services
    const servicesData = [
      ['Oil Change','Maintenance',50,'Full synthetic oil change'],
      ['Brake Inspection','Maintenance',35,'Full brake system check'],
      ['Battery Replacement','Electrical',80,'Replace car battery']
    ];
    for(const s of servicesData){
      await dbQuery(`INSERT INTO services (name,category,price,description) VALUES ($1,$2,$3,$4)`, s);
    }

    // Dummy Bookings + QR codes
    const bookingsData = [
      [1,1,'AB12 CDE','123 Medway Street',51.3326,0.5495],
      [2,2,'XY34 ZYX','45 Medway Lane',51.3350,0.5500],
      [3,3,'LM56 NOP','67 Medway Road',51.3370,0.5480],
    ];
    for(const b of bookingsData){
      const qr = await QRCode.toDataURL(`${b[2]}|${b[3]}|service:${b[1]}`);
      await dbQuery(`INSERT INTO bookings (customer_id,service_id,number_plate,address,latitude,longitude,qr_code) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [...b, qr]);
    }

    console.log('✅ Database initialized with dummy data!');
  } catch(e){
    console.error('❌ Database init error:', e);
  }
};

// API Endpoints

// Diagnostics
app.get('/api/diagnostics', async (req,res)=>{
  try {
    const dbCheck = await pool.query('SELECT 1');
    const services = await dbQuery('SELECT count(*) FROM services');
    const bookings = await dbQuery('SELECT count(*) FROM bookings');
    res.json({
      database: dbCheck ? 'OK' : 'FAIL',
      services: services.rows[0].count,
      bookings: bookings.rows[0].count
    });
  } catch(e){
    res.json({database:'FAIL', error:e.message});
  }
});

// Login
app.post('/api/login', async (req,res)=>{
  const {email,password,role} = req.body;
  try{
    const result = await dbQuery('SELECT * FROM users WHERE email=$1 AND role=$2', [email, role]);
    const user = result.rows[0];
    if(!user) return res.status(401).json({error:'Invalid credentials'});
    const match = await bcrypt.compare(password,user.password);
    if(!match) return res.status(401).json({error:'Invalid credentials'});
    const token = jwt.sign({id:user.id,role},process.env.JWT_SECRET,{expiresIn:'8h'});
    res.json({token, firstTime:user.first_time});
  }catch(e){res.status(500).json({error:e.message})}
});

// Reset password first time
app.post('/api/reset-password', authenticate('admin'), async (req,res)=>{
  const {newPassword} = req.body;
  const hashed = await bcrypt.hash(newPassword,10);
  await dbQuery('UPDATE users SET password=$1, first_time=false WHERE id=$2', [hashed, req.user.id]);
  res.json({success:true});
});

// Get bookings
app.get('/api/bookings', authenticate('mechanic'), async (req,res)=>{
  const b = await dbQuery('SELECT * FROM bookings');
  res.json(b.rows);
});

// Get services
app.get('/api/services', async (req,res)=>{
  const s = await dbQuery('SELECT * FROM services');
  res.json(s.rows);
});

// Start server
app.listen(3000, async ()=>{
  console.log('🚀 Server running on port 3000');
  await initDb();
});