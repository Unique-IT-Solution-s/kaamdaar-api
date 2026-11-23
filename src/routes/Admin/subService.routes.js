import express from "express"
import { authenticateUser } from "../../middleware/authmiddleware.js";
import { authorizeRoles } from "../../middleware/authorizeRoles.js";
import { uploadSubServiceImage } from "../../middleware/uploadAvatar.js";
import { createSubService, getAllSubServices, getSubServiceById } from "../../controllers/Admin/adminSubService.controller.js";

const routes = express.Router();

routes.post("/", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), uploadSubServiceImage, createSubService);
routes.get("/getAllSubServices", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getAllSubServices);
routes.get("/getSubServiceById/:id", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getSubServiceById);


export default routes