const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/db");
const path = require("path");

const app = express();

/* =======================
   CORS (LAN SAFE)
======================= */
app.use(cors({
    origin: true, // allow all LAN devices
    credentials: true,
}));

app.use(express.json());

/* =======================
   DEBUG LOGGING
======================= */
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
});

/* =======================
   STATIC FILES
======================= */

// uploads (images)
app.use("/uploads", express.static(process.env.UPLOAD_PATH || path.join(__dirname, "uploads")));

// ✅ SERVE REACT BUILD (THIS IS THE KEY)
app.use(
    express.static(
        path.join(__dirname, "printing-press-frontend", "dist")
    )
);

/* =======================
   API ROUTES
======================= */
app.use("/api/prepress", require("./routes/prepress"));
app.use("/api/customer", require("./routes/customer"));
app.use("/api/customer-auth", require("./routes/customer-auth"));
app.use("/api/login", require("./routes/login"));
app.use("/api/cashier", require("./routes/cashier"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin", require("./routes/admin-users"));
app.use("/api/dispatch", require("./routes/dispatch"));

/* =======================
   SPA FALLBACK
======================= */
app.get("*", (req, res) => {
    res.sendFile(
        path.join(__dirname, "printing-press-frontend", "dist", "index.html")
    );
});

/* =======================
   START SERVER
======================= */
connectDB();

const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
