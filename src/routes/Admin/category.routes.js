import express from "express";
import { authenticateUser } from "../../middleware/authmiddleware.js";
import { authorizeRoles } from "../../middleware/authorizeRoles.js";
import { createCategory, getCategories, getCategoryById, updateCategory } from "../../controllers/Admin/adminCategory.controller.js";

const routes = express.Router()

routes.post("/", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), createCategory)
routes.get("/", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getCategories)
routes.get("/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getCategoryById)
routes.put("/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), updateCategory)

export default routes;