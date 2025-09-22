import express from "express";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Routes for main pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/mechanic", (req, res) => res.sendFile(path.join(__dirname, "public", "mechanic.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

// Example API route (services list)
app.get("/api/services", (req, res) => {
  res.json([
    { id: 1, name: "Oil Change", price: 50, description: "Full synthetic oil change" },
    { id: 2, name: "Brake Service", price: 120, description: "Pads + discs replacement" },
    { id: 3, name: "Battery Replacement", price: 80, description: "OEM battery fitted" }
  ]);
});

// Fallback for 404s
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));