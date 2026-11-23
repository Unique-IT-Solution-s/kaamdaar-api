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

const importServiceFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    const allowedMimeTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ];

    const extension = file.originalname.split(".").pop().toLowerCase();

    if (!["csv", "xlsx"].includes(extension)) {
      return callback(new Error("Only CSV and XLSX files are allowed."));
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error("Invalid file type. Only CSV and XLSX are allowed."),
      );
    }

    callback(null, true);
  },
});

export const uploadServiceImportFile = importServiceFileUpload.single("file");

const subServiceImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if(!allowedTypes.includes(file.mimetype)){
      return cb(
        new Error("Only JPEG, PNG and WEBP images are allowed.")
      )
    }
    cb(null, true)
  },
});

export const uploadSubServiceImage = subServiceImageUpload.single("image");
