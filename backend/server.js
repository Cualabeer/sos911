import express from "express";
import cors from "cors";
import helmet from "helmet";
import xss from "xss-clean";
import dotenv from "dotenv";
import { Pool } from "pg";
import QRCode from "qrcode";
import Joi from "joi";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(xss());

// Serve frontend
app.use(express.static("../frontend"));

// Validation
const bookingSchema = Joi.object({
  customer_id: Joi.number().required(),
  service_id: Joi.number().required(),
});

// Fetch all services
app.get("/api/services", async (req,res)=>{
  try {
    const {rows} = await pool.query("SELECT * FROM services ORDER BY id ASC");
    res.json(rows);
  } catch(err){
    res.status(500).json({error:err.message});
  }
});

// Create booking
app.post("/api/bookings", async (req,res)=>{
  const {error,value} = bookingSchema.validate(req.body);
  if(error) return res.status(400).json({error:error.details[0].message});
  try {
    const {customer_id, service_id} = value;
    const qr_data = `booking:${customer_id}:${service_id}:${Date.now()}`;
    const qr_code = await QRCode.toDataURL(qr_data);

    const {rows} = await pool.query(
      "INSERT INTO bookings (customer_id,service_id,qr_code,status) VALUES ($1,$2,$3,'pending') RETURNING *",
      [customer_id, service_id, qr_code]
    );
    res.json({...rows[0], qr_code});
  } catch(err){
    res.status(500).json({error:err.message});
  }
});

// Diagnostics
app.get("/api/diagnostics", async (req,res)=>{
  try {
    const client = await pool.connect();
    const services = await client.query("SELECT COUNT(*) FROM services");
    const bookings = await client.query("SELECT COUNT(*) FROM bookings");
    client.release();
    res.json({
      db_status:"connected",
      services: services.rows[0].count,
      bookings: bookings.rows[0].count
    });
  } catch(err){
    res.json({db_status:"failed",error:err.message});
  }
});

app.listen(PORT,()=>console.log(`Server running on ${PORT}`));