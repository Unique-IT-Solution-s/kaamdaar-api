import express from "express";
import { authenticateUser } from "../middleware/authmiddleware.js";
import { addCustomerAddress, deleteCustomerAddress, makeDefaultCustomerAddress, updateCustomerAddress } from "../controllers/customerAddress.controller.js";

const routes = express.Router()

routes.post("/addresses", authenticateUser, addCustomerAddress)
routes.patch("/addresses/:addressId/default", authenticateUser, makeDefaultCustomerAddress)
routes.delete("/addresses/:addressId", authenticateUser, deleteCustomerAddress)
routes.patch("/addresses/:addressId", authenticateUser, updateCustomerAddress)

export default routes;