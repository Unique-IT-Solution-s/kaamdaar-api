import express from "express";
import cors from "cors";
import helmet from "helmet";
import "dotenv/config";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";

import connectDb from "./src/config/db.js";

import authRoutes from "./src/routes/authRoutes.js";
import authenticatedRoutes from "./src/routes/authenticatedRoutes.js";
import customerAuthRoutes from "./src/routes/customerAuthRoutes.js";
import customerAddressRoutes from "./src/routes/customerAddress.routes.js";
import locationRoutes from "./src/routes/location.routes.js";
import adminDashboardRoutes from "./src/routes/Admin/dashboard.routes.js";
import adminCategoryRoutes from "./src/routes/Admin/category.routes.js";
import adminServiceRoutes from "./src/routes/Admin/service.routes.js"
import adminSubServiceRoutes from "./src/routes/Admin/subService.routes.js"
import adminCatalogueRoutes from "./src/routes/Admin/adminCatalogue.routes.js"

import { socketAuthenticateUser } from "./src/middleware/socketAuth.middleware.js";

const app = express();

const port = process.env.PORT || 4000;

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Kaamdaar API is running",
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/auth", customerAuthRoutes);

app.use("/api/v1/admin/dashboard", adminDashboardRoutes);
app.use("/api/v1/admin/categories", adminCategoryRoutes);

app.use("/api/v1/admin/catalogue", adminCatalogueRoutes);

app.use("/api/v1/admin/services", adminServiceRoutes)
app.use("/api/v1/admin/subservices", adminSubServiceRoutes);

app.use("/api/v1", authenticatedRoutes);
app.use("/api/v1/customer", customerAddressRoutes);
app.use("/api/v1/location", locationRoutes);


const httpServer = createServer(app);

// ========================================
// 1. INITIALIZE SOCKET.IO
// ========================================

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});

// ========================================
// 2. SOCKET.IO AUTHENTICATION
// ========================================

io.use(socketAuthenticateUser);

// ========================================
// 3. SOCKET.IO CONNECTION
// ========================================

io.on("connection", async (socket) => {
  try {
    // Get authenticated user
    const user = socket.data.user;

    console.log("Socket connected:", socket.id);
    console.log("Connected user:", user.userId);
    console.log("User role:", user.role);

    // --------------------------------------
    // Allow only ADMIN and SUPER_ADMIN
    // --------------------------------------

    const allowedRoles = ["ADMIN", "SUPER_ADMIN"];

    if (!allowedRoles.includes(user.role)) {
      console.log("Unauthorized socket connection:", user.userId);

      socket.disconnect(true);
      return;
    }

    // --------------------------------------
    // Join admin dashboard room
    // --------------------------------------

    await socket.join("admin-dashboard");

    console.log(`Admin ${user.userId} joined admin-dashboard room`);

    // --------------------------------------
    // Send connection confirmation
    // --------------------------------------

    socket.emit("admin:connected", {
      success: true,
      message: "Connected to admin dashboard successfully.",
    });

    // --------------------------------------
    // Handle disconnection
    // --------------------------------------

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", socket.id, reason);
    });
  } catch (error) {
    console.error("Socket connection error:", error);
    socket.disconnect(true);
  }
});

// ========================================
// 4. START SERVER
// ========================================

const startServer = async () => {
  try {
    await connectDb();

    // Start HTTP server with Socket.IO
    httpServer.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
      console.log("Socket.IO server is ready");
      console.log(`Local API: http://localhost:${port}`);
      console.log(`Network API: http://YOUR_MAC_IP:${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();

export { app, httpServer, io };
