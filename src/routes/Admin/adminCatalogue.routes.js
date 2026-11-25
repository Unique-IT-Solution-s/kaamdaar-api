import express from "express";

import { authenticateUser } from "../../middleware/authmiddleware.js";
import { authorizeRoles } from "../../middleware/authorizeRoles.js";
import { uploadCatalogueImportFile } from "../../middleware/uploadAvatar.js";

import { downloadCatalogueImportTemplate, importCatalogue } from "../../controllers/Admin/adminCatalogue.controller.js";

const routes = express.Router();

routes.post(
  "/import",
  authenticateUser,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  uploadCatalogueImportFile,
  importCatalogue,
);

routes.get(
  "/import-template",
  authenticateUser,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  downloadCatalogueImportTemplate
);

export default routes;
