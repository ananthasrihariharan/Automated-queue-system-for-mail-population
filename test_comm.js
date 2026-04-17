const io = require("socket.io-client");
const socket = io("http://localhost:5000", { transports: ["websocket"] });

socket.on("connect", () => {
    console.log("Connected to server:", socket.id);
    console.log("Emitting chat:send...");
    
    socket.emit("chat:send", {
        fromId: "65e6b1234567890123456789", // fake ObjectId
        fromName: "Test Bot",
        toId: "ALL",
        jobId: null,
        message: "Hello from Test Bot"
    });
});

socket.on("chat:received", (msg) => {
    console.log("Received a broadcast:", msg);
    process.exit(0);
});

socket.on("disconnect", () => {
    console.log("Disconnected");
});

setTimeout(() => {
    console.log("Timeout waiting for broadcast response.");
    process.exit(1);
}, 3000);
