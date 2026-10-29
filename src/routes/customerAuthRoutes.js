import express from "express";
import { verifyFirebaseToken } from "../middleware/verifyFirebaseToken.js";
import { getCustomerProfile, logoutCustomer, registerCustomer, updateCustomerProfile } from "../controllers/customerAuthController.js";
import { verifyAccessToken } from "../middleware/verifyAccessToken.js";
import { deleteCustomerAvatar, getCustomerAvatar, updateCustomerAvatar } from "../controllers/customerAvatarController.js";
import { handleAvatarUpload } from "../middleware/handleAvatarUpload.js";



const router = express.Router();

router.post("/registerCustomer", verifyFirebaseToken, registerCustomer);
router.get("/getCustomerProfile", verifyAccessToken, getCustomerProfile)
router.patch("/updateCustomerProfile", verifyAccessToken, updateCustomerProfile)
router.post("/logoutCustomer", verifyAccessToken, logoutCustomer)


router.get("/me/avatar", verifyAccessToken, getCustomerAvatar)
router.patch("/updateAvatar", verifyAccessToken, handleAvatarUpload, updateCustomerAvatar)
router.delete("/deleteAvatar", verifyAccessToken, deleteCustomerAvatar)

export default router;
