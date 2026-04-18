const express = require("express");
const cors = require("cors");
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
            const QueueMessage = require("./models/QueueMessage");
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
                    const QueueUnread = require("./models/QueueUnread");
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
app.use("/api/admin/reports", require("./routes/reports"));
app.use("/api/dispatch", require("./routes/dispatch"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/job-cards", require("./routes/jobCards"));

// ── Queue System Routes ──────────────────────────────
app.use("/api/queue", require("./routes/queue"));
app.use("/api/admin/queue", require("./routes/admin-queue"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/attachments", require("./routes/attachments"));
app.use("/job-files", require("./routes/fileProxy"));

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

    // 4. Run stale session cleanup (Resilient recursive loop)
    const { cleanupStaleSessions } = require("./services/queueEngine");
    const runCleanup = async () => {
        try {
            await cleanupStaleSessions();
        } catch (err) {
            console.error('[Cleanup] Loop Error:', err.message);
        }
        setTimeout(runCleanup, 2 * 60 * 1000); // Wait 2 mins after completion before next run
    };
    runCleanup();

    console.log('[Server] All subsystems started.');
});

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
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
