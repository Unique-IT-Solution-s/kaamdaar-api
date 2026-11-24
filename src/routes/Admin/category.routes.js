import express from "express";
import { authenticateUser } from "../../middleware/authmiddleware.js";
import { authorizeRoles } from "../../middleware/authorizeRoles.js";
import { createCategory, deleteCategory, downloadCategoryImportTemplate, exportCategories, getCategories, getCategoryById, importCategories, updateCategory } from "../../controllers/Admin/adminCategory.controller.js";
import { uploadCategoryFile } from "../../middleware/uploadAvatar.js";

const routes = express.Router()

routes.get("/export", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), exportCategories)
routes.post("/import", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), uploadCategoryFile ,importCategories)
routes.get("/import-template", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), downloadCategoryImportTemplate)

routes.post("/", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), createCategory)
routes.get("/", authenticateUser, authorizeRoles("ADMIN", "CUSTOMER", "SUPER_ADMIN"), getCategories)
routes.get("/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getCategoryById)
routes.put("/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), updateCategory)
routes.delete("/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), deleteCategory)


export default routes;