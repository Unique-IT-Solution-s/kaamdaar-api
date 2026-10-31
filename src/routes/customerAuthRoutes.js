import express from "express";
import { verifyFirebaseToken } from "../middleware/verifyFirebaseToken.js";
import { getCustomerProfile, logoutCustomer, updateCustomerProfile } from "../controllers/customerAuthController.js";
// import { verifyAccessToken } from "../middleware/authmiddleware.js";
import { deleteCustomerAvatar, getCustomerAvatar, updateCustomerAvatar } from "../controllers/customerAvatarController.js";
import { handleAvatarUpload } from "../middleware/handleAvatarUpload.js";
import { authenticateUser } from "../middleware/authmiddleware.js";



const router = express.Router();

// router.post("/registerCustomer", verifyFirebaseToken, registerCustomer);
router.get("/getCustomerProfile", authenticateUser, getCustomerProfile)
router.patch("/updateCustomerProfile", authenticateUser, updateCustomerProfile)
router.post("/logoutCustomer", authenticateUser, logoutCustomer)


router.get("/me/avatar", authenticateUser, getCustomerAvatar)
router.patch("/updateAvatar", authenticateUser, handleAvatarUpload, updateCustomerAvatar)
router.delete("/deleteAvatar", authenticateUser, deleteCustomerAvatar)

export default router;
