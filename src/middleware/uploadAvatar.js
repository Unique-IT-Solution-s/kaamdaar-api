import multer from "multer";

// ==================================================
// 1 ..AVATAR UPLOAD
// ==================================================

const allowedImageMimeTypes = ["image/jpeg", "image/png", "image/webp"];

const avatarUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    if (!allowedImageMimeTypes.includes(file.mimetype)) {
      return callback(new Error("Only JPG, PNG, and WebP images are allowed."));
    }

    callback(null, true);
  },
});

export const uploadAvatar = avatarUpload.single("avatar");

// ==================================================
// 2.. CATEGORY IMPORT UPLOAD
// ==================================================

const allowedCategoryMimeTypes = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const allowedCategoryExtensions = [".csv", ".xlsx"];

const categoryUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    const fileName = file.originalname.toLowerCase();

    const extension = fileName.substring(fileName.lastIndexOf("."));

    // Check extension
    if (!allowedCategoryExtensions.includes(extension)) {
      return callback(new Error("Only CSV and XLSX files are allowed."));
    }

    // Check MIME type
    if (!allowedCategoryMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error("Invalid file type. Upload a valid CSV or XLSX file."),
      );
    }

    callback(null, true);
  },
});

export const uploadCategoryFile = categoryUpload.single("file");



// ==================================================
// 3..SERVICE IMAGES UPLOAD
// ==================================================

const serviceImageUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB per image
    files: 5, // Maximum 5 images
  },

  fileFilter: (req, file, callback) => {
    if (!allowedImageMimeTypes.includes(file.mimetype)) {
      return callback(new Error("Only JPG, PNG, and WebP images are allowed."));
    }

    callback(null, true);
  },
});

export const uploadServiceImages = serviceImageUpload.array("images", 5);
