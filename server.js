const express = require("express");
const cors = require("cors");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const connectDB = require("./config/db");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/* =======================
   SOCKET.IO SETUP
======================= */
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true,
    },
});

// Make io accessible from routes via req.app.get('io')
app.set("io", io);

// Socket.io connection handling
io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Staff joins their personal room for targeted job push
    socket.on("join:staff", (staffId) => {
        if (!staffId) return;
        const room = `staff:${String(staffId).trim().toLowerCase()}`;
        socket.join(room);
        console.log(`[Socket.io] Staff ${staffId} joined room: ${room}`);
    });

    // Admin joins the admin queue room
    socket.on("join:admin", (adminId) => {
        socket.join("admin:queue");
        if (adminId) socket.join(`staff:${adminId}`); // admins also get DMs
        console.log(`[Socket.io] Admin ${adminId || 'unknown'} joined queue room`);
    });

    // ── CHAT: handle send & persist ──────────────────────────────────
    socket.on("chat:send", async ({ fromId, fromName, toId, message, jobId }) => {
        if (!fromId || !toId || !message?.trim()) return;

        try {
            const { QueueMessage } = require("./repositories");
            const isBroadcast = String(toId).toLowerCase() === "all";

            const saved = await QueueMessage.create({
                sender: fromId,
                senderName: fromName || "Unknown",
                recipientId: String(toId).trim().toLowerCase(),
                body: message.trim(),
                type: isBroadcast ? "BROADCAST" : "DIRECT",
                jobId: jobId || null,
            });

            const payload = {
                _id: String(saved._id).toLowerCase(),
                sender: String(saved.sender).toLowerCase(),
                senderName: saved.senderName,
                recipientId: saved.recipientId,
                body: saved.body,
                type: saved.type,
                jobId: saved.jobId ? String(saved.jobId).toLowerCase() : null,
                timestamp: saved.timestamp || saved.createdAt,
            };

            if (isBroadcast) {
                // Broadcast: deliver to everyone
                io.emit("chat:received", payload);
            } else {
                // DM: deliver to recipient and sender
                io.to(`staff:${String(toId).trim().toLowerCase()}`).emit("chat:received", payload);
                io.to(`staff:${String(fromId).trim().toLowerCase()}`).emit("chat:received", payload);
            }

            // Update unread count for recipient
            if (!isBroadcast) {
                try {
                    const { QueueUnread } = require("./repositories");
                    const threadId = String(fromId).trim().toLowerCase();
                    await QueueUnread.findOneAndUpdate(
                        { userId: toId, threadId },
                        { $inc: { count: 1 } },
                        { upsert: true }
                    );
                } catch (e) { /* non-fatal */ }
            }
        } catch (err) {
            console.error("[Chat] Error saving message:", err.message);
        }
    });

    // ── CHAT: typing indicator ──────────────────────────────────────
    socket.on("chat:typing", ({ fromId, fromName, toId }) => {
        if (!fromId || !toId) return;
        if (String(toId).toLowerCase() === "all") {
            socket.broadcast.emit("chat:typing", { fromId, fromName, toId });
        } else {
            io.to(`staff:${String(toId).toLowerCase()}`).emit("chat:typing", { fromId, fromName, toId });
        }
    });

    socket.on("disconnect", () => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
});


/* =======================
   CORS (LAN SAFE)
======================= */
app.use(cors({
    origin: true, // allow all LAN devices
    credentials: true,
}));

/* =======================
   COMPRESSION
======================= */
app.use(compression());

/* =======================
   BODY PARSER (with size cap)
======================= */
app.use(express.json({ limit: '10mb' }));

/* =======================
   RATE LIMITING
======================= */
// Auth endpoints: 20 attempts per minute per IP
const authLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts, please try again in a minute.' },
});

// Queue action endpoints: 120 req/min per IP (staff polling every ~3s × 20 staff)
const queueLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET', // read-only polls are exempt; only writes are throttled
    message: { message: 'Request rate exceeded, please slow down.' },
});

app.get('/health', (_req, res) => res.json({ status: 'Main System is UP', v: '1.0.6-live-debug' }));

const axios = require('axios');
async function checkWalkinService() {
    try {
        const url = `${process.env.WALKIN_SERVICE_URL}/health`;
        await axios.get(url, { timeout: 3000 });
        console.log(`[Heartbeat] Walk-in Microservice is ONLINE ✅`);
    } catch (err) {
        console.error(`[Heartbeat] Walk-in Microservice is OFFLINE ❌ (Cannot reach ${process.env.WALKIN_SERVICE_URL})`);
    }
}
// Start heartbeat
setTimeout(() => {
    checkWalkinService();
    setInterval(checkWalkinService, 15000); // Check every 15 seconds
}, 5000);

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
app.use("/walkin-files", express.static(process.env.WALKIN_UPLOAD_PATH || path.join(__dirname, "walkins")));

// ✅ SERVE REACT BUILD (THIS IS THE KEY)
app.use(
    express.static(
        path.join(__dirname, "printing-press-frontend", "dist"),
        {
            setHeaders: (res, filePath) => {
                // Never cache index.html — ensures browser picks up new asset hashes after a build
                if (filePath.endsWith('index.html')) {
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                }
                const contentType = res.getHeader('Content-Type');
                if (contentType && !contentType.includes('charset')) {
                    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html') || filePath.endsWith('.json')) {
                        res.setHeader('Content-Type', `${contentType}; charset=utf-8`);
                    }
                }
            }
        }
    )
);


/* =======================
   API ROUTES
======================= */
app.use("/api/prepress", require("./modules/prepress/backend/prepress"));
app.use("/api/customer", require("./modules/customer/backend/customer"));
app.use("/api/customer-auth", authLimiter, require("./modules/customer/backend/customer-auth"));
app.use("/api/login", authLimiter, require("./routes/login"));
app.use("/api/cashier", require("./modules/cashier/backend/cashier"));
app.use("/api/admin", require("./modules/admin/backend/admin"));
app.use("/api/admin", require("./modules/admin/backend/admin-users"));
app.use("/api/admin/reports", require("./modules/admin/backend/reports"));
app.use("/api/dispatch", require("./modules/despatch/backend/dispatch"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/job-cards", require("./routes/jobCards"));
app.use("/api/boards", require("./routes/board"));
app.use("/api/machines", require("./routes/machine"));
app.use("/api/press", require("./modules/press/backend/press"));
app.use("/api/post-press", require("./modules/postpress/backend/post-press"));
app.use("/api/finishing", require("./modules/finishing/backend/finishing"));

app.use("/api/queue", queueLimiter, require("./routes/queue"));
app.use("/api/admin/queue", require("./modules/admin/backend/admin-queue"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/attachments", require("./routes/attachments"));
app.use("/api/whatsapp", require("./routes/whatsapp"));
app.use("/api/customer-walkin", require("./routes/customer-walkin"));
app.use("/api/internal", require("./routes/internal"));
app.use("/job-files", require("./routes/fileProxy"));

/* =======================
   SPA FALLBACK
======================= */
app.get("*", (req, res) => {
    // Never cache the SPA entry point — ensures new builds load the correct asset hashes
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(
        path.join(__dirname, "printing-press-frontend", "dist", "index.html")
    );
});

/* =======================
   START SERVER
======================= */
connectDB().then(() => {
    // 1. Start file watcher (detects new n8n email folders → creates IngestionTasks)
    const { startWatcher } = require("./services/fileWatcher");
    startWatcher(io);

    // 2. Start processing worker (converts IngestionTasks → QueueJobs)
    const processingWorker = require("./services/processingWorker");
    processingWorker.start();

    // 3. Init event handlers (socket broadcasts, audit logging, auto-assignment)
    const eventHandlers = require("./services/eventHandlers");
    eventHandlers.init(io);

    // 4. Run stale session cleanup & Workload Syncer
    const { cleanupStaleSessions, syncWorkloadToDb } = require("./services/queueEngine");
    const runMaintenance = async () => {
        try {
            await cleanupStaleSessions();
            // SYNCER: Pre-calculate workload and save to DB for multi-process stability
            await syncWorkloadToDb().catch(e => console.error('[Syncer] Error:', e.message));
        } catch (err) {
            console.error('[Maintenance] Loop Error:', err.message);
        }
        setTimeout(runMaintenance, 60000); // Run every 60 seconds (was 10s)
    };
    runMaintenance();

    console.log('[Server] All subsystems started.');
});

// Use `server` (not `app`) so that socket.io and Express share the same port
const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
    const os = require("os");
    const networkInterfaces = os.networkInterfaces();
    let localIp = "localhost";

    for (const interfaceName in networkInterfaces) {
        for (const iface of networkInterfaces[interfaceName]) {
            if (iface.family === "IPv4" && !iface.internal) {
                localIp = iface.address;
                break;
            }
        }
    }

    console.log(`\n🚀 Server is running!`);
    console.log(`🏠 Local:   http://localhost:${PORT}`);
    console.log(`🌐 Network: http://${localIp}:${PORT}`);
    if (process.env.VITE_BACKEND_URL) {
        console.log(`🌍 Public:  ${process.env.VITE_BACKEND_URL}`);
    }
    console.log(`\nReady to accept connections on all interfaces (0.0.0.0)\n`);
});
