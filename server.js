import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv"
import connectDb from "./src/config/db.js";
import "dotenv/config";

dotenv.config()

import authRoutes from "./src/routes/authRoutes.js"
import authenticatedRoutes from "./src/routes/authenticatedRoutes.js";
import customerAuthRoutes from "./src/routes/customerAuthRoutes.js";


const app = express();

app.use(helmet());
app.use(cors({
    origin : process.env.FRONTEND_URL,
    credentials : true
}))
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Kaamdaar API is running",
  });
});

const port = process.env.PORT || 4000

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1", authenticatedRoutes);
app.use("/api/v1/auth", customerAuthRoutes);

const startServer = async () => {
  await connectDb();

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer();