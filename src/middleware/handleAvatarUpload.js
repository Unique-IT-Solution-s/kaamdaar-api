import multer from "multer";
import { uploadAvatar } from "./uploadAvatar.js";

export const handleAvatarUpload = (req, res, next) => {
  uploadAvatar(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "Image size must not exceed 2 MB.",
        });
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          success: false,
          message: "Please upload one image using the 'avatar' field.",
        });
      }

      return res.status(400).json({
        success: false,
        message: "Image upload failed.",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Invalid image file.",
    });
  });
};