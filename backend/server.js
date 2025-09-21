import express from 'express';
import { Pool } from 'pg';
import bodyParser from 'body-parser';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(bodyParser.json());

// Database connection from environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required for Render
});

async function initDb() {
  try {
    // Drop tables first
    await pool.query(`DROP TABLE IF EXISTS loyalty, bookings, services, customers CASCADE`);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price NUMERIC NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        number_plate TEXT NOT NULL,
        notes TEXT,
        lat NUMERIC,
        lng NUMERIC,
        qr_code TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      );
    `);

    console.log('✅ Database initialized with tables.');

    // Insert dummy services (5 categories x 6 services = 30)
    const categories = ['Engine', 'Brakes', 'Electrical', 'Suspension', 'Diagnostics'];
    const services = [];
    categories.forEach(cat=>{
      for(let i=1;i<=6;i++){
        services.push({name:`${cat} Service ${i}`, category:cat, price: (20+i*5)});
      }
    });

    for(const s of services){
      await pool.query(`INSERT INTO services(name, category, price) VALUES($1,$2,$3)`, [s.name, s.category, s.price]);
    }
    console.log('✅ Dummy services added.');

    // Insert dummy customers & bookings
    const customers = [
      {name:'John Doe', phone:'+441234567890'},
      {name:'Jane Smith', phone:'+441234567891'},
      {name:'Bob Brown', phone:'+441234567892'}
    ];
    for(const c of customers){
      const res = await pool.query(`INSERT INTO customers(name,phone) VALUES($1,$2) RETURNING id`, [c.name, c.phone]);
      const customer_id = res.rows[0].id;

      // loyalty
      await pool.query(`INSERT INTO loyalty(customer_id, points) VALUES($1,$2)`, [customer_id, 0]);

      // dummy booking
      const serviceRes = await pool.query(`SELECT id FROM services ORDER BY RANDOM() LIMIT 1`);
      const service_id = serviceRes.rows[0].id;
      const qr = await QRCode.toDataURL(`${c.name}-${Date.now()}`);
      await pool.query(`
        INSERT INTO bookings(customer_id, service_id, number_plate, notes, lat, lng, qr_code)
        VALUES($1,$2,$3,$4,$5,$6,$7)
      `, [customer_id, service_id, 'AB12 CDE', 'Test booking', 51.386, 0.521, qr]);
    }
    console.log('✅ Dummy customers and bookings added.');

  } catch(err){
    console.error('❌ Database init error:', err);
  }
}

// Call database init on server start
initDb();

// API routes
app.get('/api/services', async (req,res)=>{
  try{
    const r = await pool.query(`SELECT * FROM services`);
    res.json(r.rows);
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/bookings', async (req,res)=>{
  const {name, phone, numberPlate, service, notes, lat, lng} = req.body;
  if(!name || !phone || !numberPlate || !service || !lat || !lng){
    return res.json({success:false,error:'Missing fields'});
  }
  try{
    // Check customer
    let customerRes = await pool.query(`SELECT id FROM customers WHERE phone=$1`, [phone]);
    let customer_id;
    if(customerRes.rows.length===0){
      const r = await pool.query(`INSERT INTO customers(name,phone) VALUES($1,$2) RETURNING id`, [name, phone]);
      customer_id = r.rows[0].id;
      await pool.query(`INSERT INTO loyalty(customer_id) VALUES($1)`, [customer_id]);
    } else {
      customer_id = customerRes.rows[0].id;
    }

    // Service id
    const serviceRes = await pool.query(`SELECT id FROM services WHERE name=$1`, [service]);
    if(serviceRes.rows.length===0) return res.json({success:false,error:'Service not found'});
    const service_id = serviceRes.rows[0].id;

    // QR code
    const qr = await QRCode.toDataURL(`${name}-${Date.now()}`);

    // Insert booking
    await pool.query(`
      INSERT INTO bookings(customer_id, service_id, number_plate, notes, lat, lng, qr_code)
      VALUES($1,$2,$3,$4,$5,$6,$7)
    `,[customer_id, service_id, numberPlate, notes, lat, lng, qr]);

    res.json({success:true,name,service:numberPlate,qr});
  }catch(err){ res.json({success:false,error:err.message}); }
});

// Diagnostics
app.get('/api/diagnostics', async (req,res)=>{
  try{
    const dbRes = await pool.query('SELECT NOW()');
    res.json({
      status:'✅ Server running',
      database:'✅ DB connected',
      db_time: dbRes.rows[0].now,
      endpoints:[
        {method:'GET',path:'/api/services'},
        {method:'POST',path:'/api/bookings'},
        {method:'GET',path:'/api/diagnostics'}
      ]
    });
  }catch(err){
    res.json({
      status:'✅ Server running',
      database:'❌ DB not connected',
      error: err.message
    });
  }
});

app.listen(process.env.PORT||3000, ()=>{
  console.log('🚀 Server running');
});