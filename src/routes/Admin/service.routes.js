import express from "express"
import { authenticateUser } from "../../middleware/authmiddleware.js";
import { authorizeRoles } from "../../middleware/authorizeRoles.js";
import { createService, deleteService, exportServices, getServiceById, getServices, importServices, updateService } from "../../controllers/Admin/adminService.controller.js";
import { uploadServiceImages, uploadServiceImportFile } from "../../middleware/uploadAvatar.js";

const routes = express.Router()

routes.post("/", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), uploadServiceImages, createService);
routes.get("/getAllServices", authenticateUser, authorizeRoles("CUSTOMER", "ADMIN", "SUPER_ADMIN"), getServices);
routes.get("/getServiceById/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getServiceById);
routes.put("/updateService/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), uploadServiceImages, updateService);
routes.delete("/deleteService/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), deleteService);
routes.get("/export", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), exportServices);
routes.post("/import", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), uploadServiceImportFile, importServices);

export default routes ;