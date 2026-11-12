import express from "express";
import { getLocationByPincode } from "../controllers/location.controller.js";

const router = express.Router();

router.get("/pincode/:postalCode", getLocationByPincode);

export default router;
