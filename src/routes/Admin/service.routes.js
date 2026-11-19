import express from "express"
import { authenticateUser } from "../../middleware/authmiddleware.js";
import { authorizeRoles } from "../../middleware/authorizeRoles.js";
import { createService, getServiceById, getServices, updateService } from "../../controllers/Admin/adminService.controller.js";
import { uploadServiceImages } from "../../middleware/uploadAvatar.js";

const routes = express.Router()

routes.post("/", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), uploadServiceImages, createService)
routes.get("/getAllServices", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getServices)
routes.get("/getServiceById/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getServiceById)
routes.put("/updateService/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), updateService)


export default routes ;