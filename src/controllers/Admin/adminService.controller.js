import mongoose from "mongoose";
import Service from "../../models/Service.js";
import Category from "../../models/Category.js";
import SubService from "../../models/SubService.js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import {
  normalizeKey,
  readExcelFile,
  readCsvFile,
} from "../../utils/importExport.utils.js";

import {
  uploadMultipleImagesToCloudinary,
  deleteImageFromCloudinary,
} from "../../utils/cloudinary.utils.js";

const normalizeText = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const parseBoolean = (value, defaultValue) => {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true") return true;
  if (normalized === "false") return false;

  return null;
};

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// ========================================
// VALIDATION HELPERS
// ========================================

const parseUpdateBoolean = (value, fieldName) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;

  throw new Error(`${fieldName} must be true or false.`);
};

const parseUpdateNumber = (value, fieldName) => {
  if (typeof value === "string" && value.trim() === "") {
    throw new Error(`${fieldName} cannot be empty.`);
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return parsedValue;
};

export const createService = async (req, res) => {
  let uploadedImages = [];
  try {
    const adminId = req.user?.id;
    if (!adminId || !mongoose.isValidObjectId(adminId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      category_id,
      service_name,
      slug,
      short_description,
      description,
      base_price,
      estimated_duration_minutes,
      is_active,
      is_featued,
      sort_order,
    } = req.body;

    if (!mongoose.isValidObjectId(category_id)) {
      return res.status(400).json({
        success: false,
        message: "Valid category_id is required.",
      });
    }

    const category = await Category.findById(category_id)
      .select("_id category_name is_active")
      .lean();
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    if (!category.is_active) {
      return res.status(400).json({
        success: false,
        message: "Cannot create a service under an inactive category.",
      });
    }

    const normalizedServiceName = normalizeText(service_name);
    if (normalizedServiceName.length < 2 || normalizedServiceName > 150) {
      return res.status(400).json({
        success: false,
        message: "Service name must be between 2 and 150 characters.",
      });
    }

    const normalizedSlug = normalizeText(slug).toLowerCase();
    if (
      !normalizedSlug ||
      normalizedSlug > 180 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid service slug.",
      });
    }

    const shortDescription = normalizeText(short_description) || null;

    const serviceDescription = normalizeText(description) || null;

    if (shortDescription && shortDescription.length > 250) {
      return res.status(400).json({
        success: false,
        message: "Short description cannot exceed 250 characters.",
      });
    }

    if (serviceDescription && serviceDescription.length > 3000) {
      return res.status(400).json({
        success: false,
        message: "service description cannot exceed 3000 characters.",
      });
    }

    const basePrice = parseNumber(base_price);
    if (
      basePrice === null ||
      !Number.isSafeInteger(basePrice) ||
      basePrice < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "base price must be a positive integer in paisa",
      });
    }

    const duration = parseNumber(estimated_duration_minutes);

    if (
      duration === null ||
      !Number.isSafeInteger(duration) ||
      duration < 5 ||
      duration > 1440
    ) {
      return res.status(400).json({
        success: false,
        message: "Duration must be between 5 and 1440 whole minutes.",
      });
    }

    const isActive = parseBoolean(is_active, true);
    const isFeatured = parseBoolean(is_featued, false);

    if (isActive === null || isFeatured === null) {
      return res.status(400).json({
        success: false,
        message: "Is active and is featured must be true or false ",
      });
    }

    const sortOrder =
      sort_order === undefined || sort_order === ""
        ? 0
        : parseNumber(sort_order);

    if (
      sortOrder === null ||
      !Number.isInteger(sortOrder) ||
      sortOrder < 0 ||
      sortOrder > 10000
    ) {
      return res.status(400).json({
        success: false,
        message: "sort_order must be a whole number between 0 and 10000.",
      });
    }

    const files = req.files || [];

    if (files.length > 5) {
      return res.status(400).json({
        success: alse,
        message: "maximum 5 services images are allowed ",
      });
    }

    const existingService = await Service.findOne({
      $or: [
        {
          slug: normalizedSlug,
        },
        {
          category_id: category._id,
          service_name: {
            $regex: `^${escapeRegex(normalizedServiceName)}$`,
            $options: "i",
          },
        },
      ],
    }).lean();

    if (existingService) {
      return res.status(409).json({
        success: false,
        message:
          existingService.slug === normalizedSlug
            ? "service slug is already exist"
            : "service name is already exist in this category",
      });
    }

    if (files.length > 0) {
      uploadedImages = await uploadMultipleImagesToCloudinary(
        files,
        "kaamdaar/services",
      );
    }

    const service = await Service.create({
      category_id: category._id,

      service_name: normalizedServiceName,
      slug: normalizedSlug,

      short_description: shortDescription,
      description: serviceDescription,

      images: uploadedImages,

      pricing: {
        base_price: basePrice,
        currency: "INR",
      },

      estimated_duration_minutes: duration,

      is_active: isActive,
      is_featured: isFeatured,
      sort_order: sortOrder,

      created_by: adminId,
    });

    return res.status(201).json({
      success: true,
      message: "Service created successfully.",
      data: {
        service,
      },
    });
  } catch (error) {
    // CLEANUP CLOUDINARY IMAGES
    if (uploadedImages.length > 0) {
      const cleanupResults = await Promise.allSettled(
        uploadedImages.map((image) =>
          deleteImageFromCloudinary(image.public_id),
        ),
      );

      cleanupResults.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Cloudinary cleanup failed:", result.reason);
        }
      });
    }

    console.error("Create service error:", error);

    // ============================================
    // HANDLE DUPLICATE KEY ERROR
    // ============================================

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Service name or slug already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create service.",
    });
  }
};

export const getServices = async (req, res) => {
  try {
    // STEP 1: GET USER ROLE
    // ============================================

    const userType = req.user?.user?.user_type ?? req.user?.user_type;

    const isCustomer = userType === "CUSTOMER";

    // STEP 2: PAGINATION
    // ============================================

    const page = req.query.page !== undefined ? Number(req.query.page) : 1;

    const limit =
      req.query.limit !== undefined ? Number(req.query.limit) : null;

    if (!Number.isSafeInteger(page) || page < 1) {
      return res.status(400).json({
        success: false,
        message: "page must be a positive number.",
      });
    }

    if (
      limit !== null &&
      (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "limit must be between 1 and 100.",
      });
    }

    if (req.query.page !== undefined && limit === null && page > 1) {
      return res.status(400).json({
        success: false,
        message: "limit is required when page is greater than 1.",
      });
    }

    const skip = limit !== null ? (page - 1) * limit : 0;

    // ============================================
    // STEP 3: SEARCH VALIDATION
    // ============================================

    if (
      req.query.search !== undefined &&
      typeof req.query.search !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid search parameter.",
      });
    }

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    // ============================================
    // STEP 4: BUILD MONGODB FILTER
    // ============================================

    const filter = {};

    if (search) {
      const escapedSearch = escapeRegex(search);

      filter.$or = [
        {
          service_name: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
        {
          slug: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
      ];
    }

    // ============================================
    // STEP 5: CATEGORY FILTER
    // ============================================

    if (req.query.category_id !== undefined) {
      const categoryId = req.query.category_id;

      if (
        typeof categoryId !== "string" ||
        !mongoose.isValidObjectId(categoryId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid category_id.",
        });
      }

      filter.category_id = new mongoose.Types.ObjectId(categoryId);
    }

    // ============================================
    // STEP 6: ACTIVE STATUS FILTER
    // ============================================

    if (req.query.is_active !== undefined) {
      if (
        typeof req.query.is_active !== "string" ||
        !["true", "false"].includes(req.query.is_active.toLowerCase())
      ) {
        return res.status(400).json({
          success: false,
          message: "is_active must be true or false.",
        });
      }

      filter.is_active = req.query.is_active.toLowerCase() === "true";
    }

    // ============================================
    // STEP 7: FEATURED FILTER
    // ============================================

    if (req.query.is_featured !== undefined) {
      if (
        typeof req.query.is_featured !== "string" ||
        !["true", "false"].includes(req.query.is_featured.toLowerCase())
      ) {
        return res.status(400).json({
          success: false,
          message: "is_featured must be true or false.",
        });
      }

      filter.is_featured = req.query.is_featured.toLowerCase() === "true";
    }

    // ============================================
    // STEP 8: CUSTOMER RESTRICTIONS
    // ============================================

    if (isCustomer) {
      // Customers can only see active services
      filter.is_active = true;

      if (filter.category_id) {
        // Check whether requested category is active
        const activeCategoryExists = await Category.exists({
          _id: filter.category_id,
          is_active: true,
        });

        if (!activeCategoryExists) {
          return res.status(200).json({
            success: true,
            message: "No active category or services found.",
            data: {
              services: [],
              pagination: {
                current_page: page,
                limit,
                total_pages: 0,
                total_services: 0,
                has_next_page: false,
                has_previous_page: false,
              },
            },
          });
        }
      } else {
        // When no category_id is supplied,
        // only fetch services under active categories

        const activeCategoryIds = await Category.find({
          is_active: true,
        }).distinct("_id");

        filter.category_id = {
          $in: activeCategoryIds,
        };
      }
    }

    // ============================================
    // STEP 9: SORT VALIDATION
    // ============================================

    const allowedSortFields = [
      "service_name",
      "createdAt",
      "updatedAt",
      "sort_order",
      "pricing.base_price",
      "estimated_duration_minutes",
    ];

    const sortBy = req.query.sort_by ?? "sort_order";
    const sortOrder = req.query.sort_order ?? "asc";

    if (typeof sortBy !== "string" || !allowedSortFields.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sort_by field.",
      });
    }

    if (
      typeof sortOrder !== "string" ||
      !["asc", "desc"].includes(sortOrder.toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "sort_order must be asc or desc.",
      });
    }

    const sort = {
      [sortBy]: sortOrder.toLowerCase() === "asc" ? 1 : -1,
      _id: 1,
    };

    // ============================================
    // STEP 10: OPTIONAL PAGINATION STAGES
    // ============================================

    const paginationStages =
      limit !== null ? [{ $skip: skip }, { $limit: limit }] : [];

    // ============================================
    // STEP 11: FETCH SERVICES AND TOTAL COUNT
    // ============================================

    const [services, totalServices] = await Promise.all([
      Service.aggregate([
        {
          $match: filter,
        },

        {
          $sort: sort,
        },

        ...paginationStages,

        // ========================================
        // LOOKUP CATEGORY DETAILS
        // ========================================

        {
          $lookup: {
            from: Category.collection.name,
            localField: "category_id",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  category_name: 1,
                  slug: 1,
                  is_active: 1,
                },
              },
            ],
            as: "categoryData",
          },
        },

        // ========================================
        // LOOKUP SUBSERVICE DETAILS
        // ========================================

        {
          $lookup: {
            from: SubService.collection.name,
            let: {
              serviceId: "$_id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$service_id", "$$serviceId"],
                  },
                },
              },
              {
                $group: {
                  _id: null,

                  total_count: {
                    $sum: 1,
                  },

                  active_count: {
                    $sum: {
                      $cond: [{ $eq: ["$is_active", true] }, 1, 0],
                    },
                  },
                },
              },
            ],
            as: "subServiceStats",
          },
        },

        // ========================================
        // ADD CATEGORY AND SERVICE DETAILS
        // ========================================

        {
          $addFields: {
            category: {
              $ifNull: [
                {
                  $arrayElemAt: ["$categoryData", 0],
                },
                null,
              ],
            },

            primary_image: {
              $ifNull: [
                {
                  $arrayElemAt: ["$images", 0],
                },
                null,
              ],
            },

            images_count: {
              $size: {
                $ifNull: ["$images", []],
              },
            },

            sub_services_count: {
              $ifNull: [
                {
                  $arrayElemAt: ["$subServiceStats.total_count", 0],
                },
                0,
              ],
            },

            active_sub_services_count: {
              $ifNull: [
                {
                  $arrayElemAt: ["$subServiceStats.active_count", 0],
                },
                0,
              ],
            },
          },
        },

        // ========================================
        // REMOVE UNNECESSARY FIELDS
        // ========================================

        {
          $project: {
            __v: 0,
            categoryData: 0,
            subServiceStats: 0,
          },
        },
      ]),

      Service.countDocuments(filter),
    ]);

    const totalPages =
      limit !== null ? Math.ceil(totalServices / limit) : totalServices > 0 ? 1 : 0;

    return res.status(200).json({
      success: true,
      message: "Services fetched successfully.",

      data: {
        services,

        pagination: {
          current_page: page,
          limit,
          total_pages: totalPages,
          total_services: totalServices,

          has_next_page: limit !== null && page < totalPages,

          has_previous_page: limit !== null && page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get services error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch services.",
    });
  }
};

export const getServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service id",
      });
    }

    const serviceId = new mongoose.Types.ObjectId(id);

    // console.log("Category collection:", Category.collection.name);
    // console.log("Service collection:", Service.collection.name);
    // console.log("Service category ID:", serviceId);

    // const categoryCheck = await Category.findById("6afda3b5e2eed8276a1c792c");

    // console.log("Category found:", categoryCheck);

    const services = await Service.aggregate([
      {
        $match: {
          _id: serviceId,
        },
      },

      // STEP 4: Get category details
      {
        $lookup: {
          from: Category.collection.name,
          localField: "category_id",
          foreignField: "_id",
          as: "categoryData",
        },
      },

      // STEP 5: Get sub-service counts
      {
        $lookup: {
          from: SubService.collection.name,
          let: {
            serviceId: "$_id",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$service_id", "$$serviceId"],
                },
              },
            },
            {
              $group: {
                _id: null,
                total_count: {
                  $sum: 1,
                },
                active_count: {
                  $sum: {
                    $cond: [{ $eq: ["$is_active", true] }, 1, 0],
                  },
                },
              },
            },
          ],
          as: "subServiceStats",
        },
      },

      // STEP 6: Add calculated fields
      {
        $addFields: {
          category: {
            $ifNull: [{ $arrayElemAt: ["$categoryData", 0] }, null],
          },

          primary_image: {
            $ifNull: [{ $arrayElemAt: ["$images", 0] }, null],
          },

          images_count: {
            $size: {
              $ifNull: ["$images", []],
            },
          },

          sub_services_count: {
            $ifNull: [
              {
                $arrayElemAt: ["$subServiceStats.total_count", 0],
              },
              0,
            ],
          },

          active_sub_services_count: {
            $ifNull: [
              {
                $arrayElemAt: ["$subServiceStats.active_count", 0],
              },
              0,
            ],
          },
        },
      },

      // STEP 7: Remove temporary fields
      {
        $project: {
          __v: 0,
          categoryData: 0,
          subServiceStats: 0,
        },
      },
    ]);

    // STEP 8: Check if service exists
    if (!services.length) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service fetched successfully.",
      data: {
        service: services[0],
      },
    });
  } catch (error) {
    console.error("Get Service By ID Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching service.",
    });
  }
};

export const updateService = async (req, res) => {
  let uploadedImages = [];
  let isDatabaseUpdated = false;

  //   console.log("========== UPDATE SERVICE DEBUG ==========");

  // console.log("Request params:", req.params);
  // console.log("Request body:", req.body);
  // console.log("Uploaded files:", req.files);

  // console.log("Files count:", req.files?.length || 0);

  // console.log("==========================================");

  try {
    // ========================================
    // STEP 1: VALIDATE SERVICE ID
    // ========================================

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
    }

    const serviceId = new mongoose.Types.ObjectId(id);

    // ========================================
    // STEP 2: VALIDATE ADMIN
    // ========================================

    const adminId = req.user?.id;

    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // Role authorization is already handled by
    // authenticateUser and authorizeRoles middleware.

    // ========================================
    // STEP 3: CHECK SERVICE EXISTENCE
    // ========================================

    const service = await Service.findById(serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    const body = req.body || {};
    const files = req.files || [];

    // ========================================
    // STEP 4: VALIDATE REQUEST BODY FIELDS
    // ========================================

    const allowedFields = [
      "service_name",
      "slug",
      "category_id",
      "short_description",
      "description",
      "base_price",
      "estimated_duration_minutes",
      "is_active",
      "is_featured",
      "sort_order",
      "remove_images",
    ];

    const unsupportedFields = Object.keys(body).filter(
      (field) => !allowedFields.includes(field),
    );

    if (unsupportedFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Unsupported update fields.",
        unsupported_fields: unsupportedFields,
      });
    }

    if (files.length > 5) {
      return res.status(400).json({
        success: false,
        message: "You can upload a maximum of 5 images.",
      });
    }

    // Track which fields the admin actually provided.
    const hasField = (field) =>
      Object.prototype.hasOwnProperty.call(body, field);

    // ========================================
    // STEP 4A: VALIDATE CATEGORY
    // ========================================

    let nextCategoryId = service.category_id;

    if (hasField("category_id")) {
      const categoryId =
        typeof body.category_id === "string" ? body.category_id.trim() : "";

      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID.",
        });
      }

      const category = await Category.findOne({
        _id: categoryId,
        is_active: true,
      }).select("_id");

      if (!category) {
        return res.status(400).json({
          success: false,
          message: "Selected category does not exist or is inactive.",
        });
      }

      nextCategoryId = category._id;
    }

    // ========================================
    // STEP 4B: VALIDATE SERVICE NAME
    // ========================================

    let nextServiceName = service.service_name;

    if (hasField("service_name")) {
      if (typeof body.service_name !== "string") {
        return res.status(400).json({
          success: false,
          message: "Service name must be a string.",
        });
      }

      nextServiceName = body.service_name.trim();

      if (nextServiceName.length < 2 || nextServiceName.length > 150) {
        return res.status(400).json({
          success: false,
          message: "Service name must be between 2 and 150 characters.",
        });
      }
    }

    // ========================================
    // STEP 4C: VALIDATE SLUG
    // ========================================

    let nextSlug = service.slug;

    if (hasField("slug")) {
      if (typeof body.slug !== "string") {
        return res.status(400).json({
          success: false,
          message: "Slug must be a string.",
        });
      }

      nextSlug = body.slug.trim().toLowerCase();

      if (
        nextSlug.length > 180 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nextSlug)
      ) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid service slug.",
        });
      }
    }

    // ========================================
    // STEP 4D: CHECK DUPLICATE SLUG
    // ========================================

    if (nextSlug !== service.slug) {
      const existingSlug = await Service.findOne({
        _id: { $ne: serviceId },
        slug: nextSlug,
      }).select("_id");

      if (existingSlug) {
        return res.status(409).json({
          success: false,
          message: "This service slug is already in use.",
        });
      }
    }

    // ========================================
    // STEP 4E: CHECK DUPLICATE SERVICE NAME
    // WITHIN THE SELECTED CATEGORY
    // ========================================

    const categoryChanged =
      nextCategoryId.toString() !== service.category_id.toString();

    const nameChanged = nextServiceName !== service.service_name;

    if (categoryChanged || nameChanged) {
      const existingName = await Service.findOne({
        _id: { $ne: serviceId },
        category_id: nextCategoryId,
        service_name: {
          $regex: `^${escapeRegex(nextServiceName)}$`,
          $options: "i",
        },
      }).select("_id");

      if (existingName) {
        return res.status(409).json({
          success: false,
          message: "A service with this name already exists in this category.",
        });
      }
    }

    // ========================================
    // STEP 4F: VALIDATE DESCRIPTIONS
    // ========================================

    let nextShortDescription = service.short_description;
    let nextDescription = service.description;

    if (hasField("short_description")) {
      if (typeof body.short_description !== "string") {
        return res.status(400).json({
          success: false,
          message: "Short description must be a string.",
        });
      }

      nextShortDescription = body.short_description.trim() || null;

      if (nextShortDescription && nextShortDescription.length > 250) {
        return res.status(400).json({
          success: false,
          message: "Short description cannot exceed 250 characters.",
        });
      }
    }

    if (hasField("description")) {
      if (typeof body.description !== "string") {
        return res.status(400).json({
          success: false,
          message: "Description must be a string.",
        });
      }

      nextDescription = body.description.trim() || null;

      if (nextDescription && nextDescription.length > 3000) {
        return res.status(400).json({
          success: false,
          message: "Description cannot exceed 3000 characters.",
        });
      }
    }

    // ========================================
    // STEP 4G: VALIDATE BASE PRICE
    // ========================================

    let nextBasePrice = service.pricing.base_price;

    if (hasField("base_price")) {
      nextBasePrice = parseUpdateNumber(body.base_price, "base_price");

      if (!Number.isSafeInteger(nextBasePrice) || nextBasePrice < 1) {
        return res.status(400).json({
          success: false,
          message: "Base price must be a positive safe integer in paise.",
        });
      }
    }

    // ========================================
    // STEP 4H: VALIDATE DURATION
    // ========================================

    let nextDuration = service.estimated_duration_minutes;

    if (hasField("estimated_duration_minutes")) {
      nextDuration = parseUpdateNumber(
        body.estimated_duration_minutes,
        "estimated_duration_minutes",
      );

      if (
        !Number.isInteger(nextDuration) ||
        nextDuration < 5 ||
        nextDuration > 1440
      ) {
        return res.status(400).json({
          success: false,
          message: "Duration must be an integer between 5 and 1440 minutes.",
        });
      }
    }

    // ========================================
    // STEP 4I: VALIDATE BOOLEAN FIELDS
    // ========================================

    let nextIsActive = service.is_active;
    let nextIsFeatured = service.is_featured;

    if (hasField("is_active")) {
      nextIsActive = parseUpdateBoolean(body.is_active, "is_active");
    }

    if (hasField("is_featured")) {
      nextIsFeatured = parseUpdateBoolean(body.is_featured, "is_featured");
    }

    // ========================================
    // STEP 4J: VALIDATE SORT ORDER
    // ========================================

    let nextSortOrder = service.sort_order;

    if (hasField("sort_order")) {
      nextSortOrder = parseUpdateNumber(body.sort_order, "sort_order");

      if (
        !Number.isInteger(nextSortOrder) ||
        nextSortOrder < 0 ||
        nextSortOrder > 10000
      ) {
        return res.status(400).json({
          success: false,
          message: "Sort order must be an integer between 0 and 10000.",
        });
      }
    }

    // ========================================
    // STEP 5: VALIDATE IMAGE REMOVAL REQUEST
    // ========================================

    let removeImageIds = [];

    if (hasField("remove_images")) {
      try {
        removeImageIds =
          typeof body.remove_images === "string"
            ? JSON.parse(body.remove_images)
            : body.remove_images;
      } catch {
        return res.status(400).json({
          success: false,
          message: "remove_images must be a valid JSON array.",
        });
      }

      if (
        !Array.isArray(removeImageIds) ||
        !removeImageIds.every(
          (imageId) => typeof imageId === "string" && imageId.trim().length > 0,
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "remove_images must be an array of valid public_id strings.",
        });
      }

      removeImageIds = [
        ...new Set(removeImageIds.map((imageId) => imageId.trim())),
      ];
    }

    const existingImages = service.images || [];

    const existingPublicIds = new Set(
      existingImages.map((image) => image.public_id),
    );

    const invalidImageIds = removeImageIds.filter(
      (imageId) => !existingPublicIds.has(imageId),
    );

    if (invalidImageIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "One or more images do not belong to this service.",
        invalid_image_ids: invalidImageIds,
      });
    }

    // ========================================
    // STEP 5A: CALCULATE FINAL IMAGE COUNT
    // ========================================

    const retainedImages = existingImages.filter(
      (image) => !removeImageIds.includes(image.public_id),
    );

    const finalImageCount = retainedImages.length + files.length;

    if (finalImageCount > 5) {
      return res.status(400).json({
        success: false,
        message: "A service can have a maximum of 5 images.",
        existing_images: existingImages.length,
        images_to_remove: removeImageIds.length,
        new_images: files.length,
        final_image_count: finalImageCount,
        maximum_images: 5,
      });
    }

    // ========================================
    // STEP 6: UPLOAD NEW IMAGES
    // ========================================

    if (files.length > 0) {
      uploadedImages = await uploadMultipleImagesToCloudinary(
        files,
        "kaamdaar/services",
      );
    }

    // ========================================
    // STEP 7: UPDATE SERVICE FIELDS
    // ========================================

    service.category_id = nextCategoryId;
    service.service_name = nextServiceName;
    service.slug = nextSlug;

    service.short_description = nextShortDescription;
    service.description = nextDescription;

    service.pricing.base_price = nextBasePrice;
    service.pricing.currency = "INR";

    service.estimated_duration_minutes = nextDuration;

    service.is_active = nextIsActive;
    service.is_featured = nextIsFeatured;
    service.sort_order = nextSortOrder;

    // Keep retained images and add newly uploaded images.
    service.images = [...retainedImages, ...uploadedImages];

    service.updated_by = adminId;

    // Save MongoDB document.
    await service.save();

    isDatabaseUpdated = true;

    // ========================================
    // STEP 8: DELETE REMOVED CLOUDINARY IMAGES
    // ========================================

    const imagesToDelete = existingImages.filter((image) =>
      removeImageIds.includes(image.public_id),
    );

    const deletionResults = await Promise.allSettled(
      imagesToDelete.map((image) => deleteImageFromCloudinary(image.public_id)),
    );

    const failedDeletions = deletionResults
      .map((result, index) => ({
        result,
        image: imagesToDelete[index],
      }))
      .filter(({ result }) => result.status === "rejected");

    failedDeletions.forEach(({ result, image }) => {
      console.error(
        `Cloudinary deletion failed for ${image.public_id}:`,
        result.reason,
      );
    });

    // ========================================
    // STEP 9: FETCH UPDATED RELATED DETAILS
    // ========================================

    const [updatedCategory, subServiceStats] = await Promise.all([
      Category.findById(service.category_id).select(
        "category_name slug description icon image is_active",
      ),

      SubService.aggregate([
        {
          $match: {
            service_id: service._id,
          },
        },
        {
          $group: {
            _id: null,
            total_count: {
              $sum: 1,
            },
            active_count: {
              $sum: {
                $cond: [{ $eq: ["$is_active", true] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    const updatedService = service.toObject();

    updatedService.category = updatedCategory;
    updatedService.primary_image = updatedService.images[0] || null;

    updatedService.images_count = updatedService.images.length;

    updatedService.sub_services_count = subServiceStats[0]?.total_count || 0;

    updatedService.active_sub_services_count =
      subServiceStats[0]?.active_count || 0;

    // ========================================
    // STEP 10: SEND RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Service updated successfully.",
      data: {
        service: updatedService,
        image_update: {
          retained_images: retainedImages.length,
          uploaded_images: uploadedImages.length,
          removed_images: imagesToDelete.length,
          total_images: updatedService.images_count,
          failed_cloudinary_deletions: failedDeletions.length,
        },
      },
    });
  } catch (error) {
    console.error("Update Service Error:", error);

    // Do not delete newly uploaded images if MongoDB
    // has already saved references to them.
    if (!isDatabaseUpdated && uploadedImages.length > 0) {
      const cleanupResults = await Promise.allSettled(
        uploadedImages.map((image) =>
          deleteImageFromCloudinary(image.public_id),
        ),
      );

      cleanupResults.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Cloudinary upload cleanup failed:", result.reason);
        }
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A service with this slug already exists.",
      });
    }

    if (
      error.message?.includes("must be true or false.") ||
      error.message?.includes("cannot be empty.") ||
      error.message?.includes("must be a valid number.")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while updating service.",
    });
  }
};

export const deleteService = async (req, res) => {
  let session = null;

  let deletionMode = null;
  let totalSubServices = 0;
  let deactivatedSubServices = 0;
  let serviceImages = [];

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service Id",
      });
    }

    const serviceId = new mongoose.Types.ObjectId(id);

    const adminId = req.user?.id;

    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      const service = await Service.findById(serviceId).session(session);

      if (!service) {
        return;
      }

      serviceImages = service.images || [];

      // STEP 4: Count all sub-services
      totalSubServices = await SubService.countDocuments({
        service_id: serviceId,
      }).session(session);

      // STEP 5: If sub-services exist, deactivate everything
      if (totalSubServices > 0) {
        await Service.updateOne(
          { _id: serviceId },
          {
            $set: {
              is_active: false,
              updated_by: adminId,
            },
          },
          { session },
        );

        const subServiceResult = await SubService.updateMany(
          { service_id: serviceId },
          {
            $set: {
              is_active: false,
              updated_by: adminId,
            },
          },
          { session },
        );

        deactivatedSubServices = subServiceResult.modifiedCount;

        deletionMode = "SOFT_DELETE";

        return;
      }

      // STEP 6: If no sub-services exist, hard delete
      await Service.deleteOne({ _id: serviceId }, { session });

      deletionMode = "HARD_DELETE";
    });

    // STEP 7: Check service existence
    if (!deletionMode) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    // STEP 8: Delete Cloudinary images only after hard deletion
    let cloudinaryDeletionResults = {
      total_images: 0,
      deleted_images: 0,
      failed_images: 0,
    };

    if (deletionMode === "HARD_DELETE" && serviceImages.length > 0) {
      const deletionResults = await Promise.allSettled(
        serviceImages.map((image) =>
          deleteImageFromCloudinary(image.public_id),
        ),
      );

      const successfulDeletions = deletionResults.filter(
        (result) => result.status === "fulfilled",
      ).length;

      const failedDeletions = deletionResults.filter(
        (result) => result.status === "rejected",
      );

      failedDeletions.forEach((result) => {
        console.error("Cloudinary deletion failed:", result.reason);
      });

      cloudinaryDeletionResults = {
        total_images: serviceImages.length,
        deleted_images: successfulDeletions,
        failed_images: failedDeletions.length,
      };
    }

    // STEP 9: Soft-delete response
    if (deletionMode === "SOFT_DELETE") {
      return res.status(200).json({
        success: true,
        message:
          "Service and its sub-services have been deactivated successfully.",
        data: {
          service_id: serviceId,
          deletion_type: deletionMode,
          service_status: "INACTIVE",
          total_sub_services: totalSubServices,
          deactivated_sub_services: deactivatedSubServices,
          images_deleted: false,
        },
      });
    }

    // STEP 10: Hard-delete response
    return res.status(200).json({
      success: true,
      message: "Service permanently deleted successfully.",
      data: {
        service_id: serviceId,
        deletion_type: deletionMode,
        total_sub_services: 0,
        cloudinary: cloudinaryDeletionResults,
      },
    });
  } catch (error) {
    console.error("Delete Service Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error while deleting service.",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

export const exportServices = async (req, res) => {
  try {
    // ============================================
    // STEP 1: VALIDATE EXPORT FORMAT
    // ============================================

    const format = String(req.query?.format || "xlsx")
      .trim()
      .toLowerCase();

    const allowedFormats = ["xlsx", "csv", "pdf"];

    if (!allowedFormats.includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid export format. Allowed formats: xlsx, csv, pdf.",
      });
    }

    // ============================================
    // STEP 2: PARSE BOOLEAN QUERY PARAMETERS
    // ============================================

    const parseExportBoolean = (value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      const normalizedValue = String(value)
        .trim()
        .replace(/^["']|["']$/g, "")
        .toLowerCase();

      if (normalizedValue === "true") return true;
      if (normalizedValue === "false") return false;

      return null;
    };

    const isActive = parseExportBoolean(req.query.is_active);
    const isFeatured = parseExportBoolean(req.query.is_featured);

    if (req.query.is_active !== undefined && isActive === null) {
      return res.status(400).json({
        success: false,
        message: "is_active must be either true or false.",
      });
    }

    if (req.query.is_featured !== undefined && isFeatured === null) {
      return res.status(400).json({
        success: false,
        message: "is_featured must be either true or false.",
      });
    }

    // ============================================
    // STEP 3: BUILD MONGODB FILTER
    // ============================================

    const filter = {};

    if (isActive !== undefined) {
      filter.is_active = isActive;
    }

    if (isFeatured !== undefined) {
      filter.is_featured = isFeatured;
    }

    // Category filter
    if (req.query.category_id !== undefined) {
      const categoryId = String(req.query.category_id).trim();

      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category_id.",
        });
      }

      filter.category_id = new mongoose.Types.ObjectId(categoryId);
    }

    // Search filter
    if (req.query.search !== undefined) {
      const search = String(req.query.search).trim();

      if (search) {
        const escapedSearch = escapeRegex(search);

        filter.$or = [
          {
            service_name: {
              $regex: escapedSearch,
              $options: "i",
            },
          },
          {
            slug: {
              $regex: escapedSearch,
              $options: "i",
            },
          },
        ];
      }
    }

    // STEP 4: VALIDATE SORTING
    // ============================================

    const allowedSortFields = [
      "service_name",
      "createdAt",
      "updatedAt",
      "sort_order",
      "estimated_duration_minutes",
      "pricing.base_price",
    ];

    const sortBy = req.query.sort_by || "sort_order";
    const sortOrder = req.query.sort_order || "asc";

    if (!allowedSortFields.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sort_by field.",
      });
    }

    if (!["asc", "desc"].includes(sortOrder)) {
      return res.status(400).json({
        success: false,
        message: "sort_order must be asc or desc.",
      });
    }

    const sort = {
      [sortBy]: sortOrder === "asc" ? 1 : -1,
      _id: 1,
    };

    // ============================================
    // STEP 5: FETCH SERVICES WITH RELATED DETAILS
    // ============================================

    const services = await Service.aggregate([
      {
        $match: filter,
      },

      {
        $sort: sort,
      },

      // Lookup category details
      {
        $lookup: {
          from: Category.collection.name,
          localField: "category_id",
          foreignField: "_id",
          as: "categoryData",
        },
      },

      // Lookup sub-service counts
      {
        $lookup: {
          from: SubService.collection.name,
          let: {
            serviceId: "$_id",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$service_id", "$$serviceId"],
                },
              },
            },
            {
              $group: {
                _id: null,
                total_count: {
                  $sum: 1,
                },
                active_count: {
                  $sum: {
                    $cond: [{ $eq: ["$is_active", true] }, 1, 0],
                  },
                },
              },
            },
          ],
          as: "subServiceStats",
        },
      },

      // Add calculated fields
      {
        $addFields: {
          category: {
            $ifNull: [
              {
                $arrayElemAt: ["$categoryData", 0],
              },
              null,
            ],
          },

          images_count: {
            $size: {
              $ifNull: ["$images", []],
            },
          },

          sub_services_count: {
            $ifNull: [
              {
                $arrayElemAt: ["$subServiceStats.total_count", 0],
              },
              0,
            ],
          },

          active_sub_services_count: {
            $ifNull: [
              {
                $arrayElemAt: ["$subServiceStats.active_count", 0],
              },
              0,
            ],
          },
        },
      },

      // Remove temporary fields
      {
        $project: {
          __v: 0,
          categoryData: 0,
          subServiceStats: 0,
        },
      },
    ]);

    // ============================================
    // STEP 6: CHECK SERVICES
    // ============================================

    if (!services.length) {
      return res.status(404).json({
        success: false,
        message: "No services found to export.",
      });
    }

    // ============================================
    // STEP 7: CREATE EXCEL WORKBOOK
    // ============================================

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Kaamdaar Admin";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Services");

    worksheet.columns = [
      { header: "Service ID", key: "service_id", width: 28 },
      { header: "Service Name", key: "service_name", width: 25 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Category ID", key: "category_id", width: 28 },
      { header: "Category Name", key: "category_name", width: 25 },
      { header: "Short Description", key: "short_description", width: 35 },
      { header: "Description", key: "description", width: 45 },
      { header: "Base Price (INR)", key: "base_price", width: 18 },
      { header: "Currency", key: "currency", width: 12 },
      { header: "Duration (Minutes)", key: "duration", width: 20 },
      { header: "Active", key: "is_active", width: 12 },
      { header: "Featured", key: "is_featured", width: 12 },
      { header: "Sort Order", key: "sort_order", width: 15 },
      { header: "Images Count", key: "images_count", width: 15 },
      { header: "Sub Services Count", key: "sub_services_count", width: 20 },
      {
        header: "Active Sub Services",
        key: "active_sub_services_count",
        width: 20,
      },
      { header: "Created By", key: "created_by", width: 28 },
      { header: "Updated By", key: "updated_by", width: 28 },
      { header: "Created At", key: "createdAt", width: 25 },
      { header: "Updated At", key: "updatedAt", width: 25 },
    ];

    // STEP 8: ADD SERVICE DATA
    // ============================================

    services.forEach((service) => {
      worksheet.addRow({
        service_id: service._id?.toString(),
        service_name: service.service_name,
        slug: service.slug,
        category_id: service.category_id?.toString() || "",
        category_name: service.category?.category_name || "",
        short_description: service.short_description || "",
        description: service.description || "",

        // Database stores paise; export displays rupees.
        base_price: Number((service.pricing?.base_price || 0) / 100).toFixed(2),

        currency: service.pricing?.currency || "INR",
        duration: service.estimated_duration_minutes,

        is_active: service.is_active,
        is_featured: service.is_featured,
        sort_order: service.sort_order,

        images_count: service.images_count,
        sub_services_count: service.sub_services_count,
        active_sub_services_count: service.active_sub_services_count,

        created_by: service.created_by?.toString() || "",
        updated_by: service.updated_by?.toString() || "",
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
      });
    });

    // ============================================
    // STEP 9: STYLE EXCEL HEADER
    // ============================================

    const headerRow = worksheet.getRow(1);

    headerRow.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };

    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    };

    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    headerRow.height = 25;

    // Enable Excel filters
    worksheet.autoFilter = {
      from: "A1",
      to: `T${services.length + 1}`,
    };

    // Freeze header
    worksheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    // ============================================
    // STEP 10: XLSX EXPORT
    // ============================================

    if (format === "xlsx") {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="services.xlsx"',
      );

      await workbook.xlsx.write(res);
      return res.end();
    }

    // ============================================
    // STEP 11: CSV EXPORT
    // ============================================

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="services.csv"',
      );

      await workbook.csv.write(res);
      return res.end();
    }

    // ============================================
    // STEP 12: PDF EXPORT
    // ============================================

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="services.pdf"',
      );

      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 30,
      });

      doc.pipe(res);

      const headers = [
        "Service",
        "Category",
        "Slug",
        "Price (INR)",
        "Duration",
        "Active",
        "Featured",
        "Subservices",
      ];

      const columnWidths = [125, 105, 125, 75, 65, 55, 65, 85];

      const startX = 30;
      const rowHeight = 28;

      const drawTableHeader = (y) => {
        let x = startX;

        doc.font("Helvetica-Bold").fontSize(8);

        headers.forEach((header, index) => {
          doc.text(header, x, y, {
            width: columnWidths[index],
            height: rowHeight,
            ellipsis: true,
          });

          x += columnWidths[index];
        });

        return y + rowHeight;
      };

      // PDF title
      doc.font("Helvetica-Bold").fontSize(18);
      doc.text("Services Export", {
        align: "center",
      });

      doc.moveDown();

      doc.font("Helvetica").fontSize(10);
      doc.text(`Total Services: ${services.length}`);

      doc.moveDown();

      let currentY = doc.y;
      currentY = drawTableHeader(currentY);

      // Draw service rows
      services.forEach((service) => {
        if (currentY > 520) {
          doc.addPage({
            size: "A4",
            layout: "landscape",
            margin: 30,
          });

          currentY = 30;
          currentY = drawTableHeader(currentY);
        }

        const rowData = [
          service.service_name || "",
          service.category?.category_name || "",
          service.slug || "",
          ((service.pricing?.base_price || 0) / 100).toFixed(2),
          service.estimated_duration_minutes || 0,
          service.is_active ? "Yes" : "No",
          service.is_featured ? "Yes" : "No",
          service.sub_services_count || 0,
        ];

        let currentX = startX;

        doc.font("Helvetica").fontSize(7);

        rowData.forEach((value, index) => {
          doc.text(String(value), currentX, currentY, {
            width: columnWidths[index],
            height: rowHeight,
            ellipsis: true,
          });

          currentX += columnWidths[index];
        });

        currentY += rowHeight;
      });

      doc.end();
      return;
    }
  } catch (error) {
    console.error("Export Services Error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to export services.",
      });
    }

    return res.end();
  }
};

export const importServices = async (req, res) => {
  try {
    // STEP 1: CHECK FILE
    // ============================================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV or Excel file.",
      });
    }

    const extension = req.file.originalname.split(".").pop().toLowerCase();

    if (!["csv", "xlsx"].includes(extension)) {
      return res.status(400).json({
        success: false,
        message: "Only CSV and XLSX files are allowed.",
      });
    }

    // STEP 2: READ FILE
    // ============================================

    let rows;

    if (extension === "csv") {
      rows = readCsvFile(req.file.buffer);
    } else {
      rows = await readExcelFile(req.file.buffer);
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "The uploaded file is empty.",
      });
    }

    if (rows.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Maximum 500 rows are allowed per import.",
      });
    }

    // STEP 3: VALIDATE ADMIN
    // ============================================

    const adminId = req.user?.id;

    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    // STEP 4: PREPARE ROWS AND VALIDATE FIELDS
    // ============================================

    const validRows = [];
    const invalidServices = [];
    const duplicateServices = [];

    const fileSlugSet = new Set();
    const fileNameSet = new Set();

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index] || {};

      const categoryId = normalizeText(row.category_id);
      const serviceName = normalizeText(row.service_name);
      const slug = normalizeText(row.slug).toLowerCase();

      const shortDescription = normalizeText(row.short_description) || null;

      const description = normalizeText(row.description) || null;

      const basePrice = parseNumber(row.base_price, null);

      const duration = parseNumber(row.estimated_duration_minutes, null);

      const isActive = parseBoolean(row.is_active, true);
      const isFeatured = parseBoolean(row.is_featured, false);

      const sortOrder = parseNumber(row.sort_order, 0);

      const errors = [];

      // Required fields
      if (!categoryId) {
        errors.push("category_id is required.");
      } else if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        errors.push("category_id must be a valid MongoDB ObjectId.");
      }

      if (!serviceName) {
        errors.push("service_name is required.");
      } else if (serviceName.length < 2 || serviceName.length > 150) {
        errors.push("service_name must be between 2 and 150 characters.");
      }

      if (!slug) {
        errors.push("slug is required.");
      } else if (
        slug.length > 180 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      ) {
        errors.push("Please provide a valid service slug.");
      }

      // Description validation
      if (shortDescription && shortDescription.length > 250) {
        errors.push("short_description cannot exceed 250 characters.");
      }

      if (description && description.length > 3000) {
        errors.push("description cannot exceed 3000 characters.");
      }

      // Price validation: integer in paise
      if (
        basePrice === null ||
        !Number.isSafeInteger(basePrice) ||
        basePrice < 1
      ) {
        errors.push("base_price must be a positive integer in paise.");
      }

      // Duration validation
      if (
        duration === null ||
        !Number.isSafeInteger(duration) ||
        duration < 5 ||
        duration > 1440
      ) {
        errors.push(
          "estimated_duration_minutes must be an integer between 5 and 1440.",
        );
      }

      // Boolean validation
      if (isActive === null) {
        errors.push("is_active must be true or false.");
      }

      if (isFeatured === null) {
        errors.push("is_featured must be true or false.");
      }

      // Sort order validation
      if (
        sortOrder === null ||
        !Number.isSafeInteger(sortOrder) ||
        sortOrder < 0 ||
        sortOrder > 10000
      ) {
        errors.push("sort_order must be an integer between 0 and 10000.");
      }

      // Duplicate checks within uploaded file
      const normalizedName = normalizeKey(serviceName);
      const normalizedSlug = normalizeKey(slug);

      const nameKey = `${categoryId.toLowerCase()}:${normalizedName}`;

      if (serviceName && fileNameSet.has(nameKey)) {
        errors.push(
          "Duplicate service_name found within the same category in uploaded file.",
        );
      }

      if (slug && fileSlugSet.has(normalizedSlug)) {
        errors.push("Duplicate slug found in uploaded file.");
      }

      // Record valid-looking keys to detect repeated rows
      if (
        categoryId &&
        serviceName &&
        mongoose.Types.ObjectId.isValid(categoryId)
      ) {
        fileNameSet.add(nameKey);
      }

      if (slug) {
        fileSlugSet.add(normalizedSlug);
      }

      if (errors.length > 0) {
        invalidServices.push({
          row_number: index + 2,
          category_id: categoryId,
          service_name: serviceName,
          slug,
          errors,
        });

        continue;
      }

      validRows.push({
        row_number: index + 2,
        category_id: new mongoose.Types.ObjectId(categoryId),
        service_name: serviceName,
        slug,
        short_description: shortDescription,
        description,
        base_price: basePrice,
        estimated_duration_minutes: duration,
        is_active: isActive,
        is_featured: isFeatured,
        sort_order: sortOrder,
        created_by: adminId,
      });
    }

    // STEP 5: CHECK CATEGORY EXISTENCE AND STATUS
    // ============================================

    const categoryIds = [
      ...new Set(validRows.map((service) => service.category_id.toString())),
    ];

    const categories = categoryIds.length
      ? await Category.find({
          _id: {
            $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
        })
          .select("_id category_name is_active")
          .lean()
      : [];

    const categoryMap = new Map(
      categories.map((category) => [category._id.toString(), category]),
    );

    const rowsWithValidCategories = [];

    for (const service of validRows) {
      const category = categoryMap.get(service.category_id.toString());

      const errors = [];

      if (!category) {
        errors.push("Category does not exist.");
      } else if (!category.is_active) {
        errors.push("Cannot import service under an inactive category.");
      }

      if (errors.length > 0) {
        invalidServices.push({
          row_number: service.row_number,
          category_id: service.category_id.toString(),
          service_name: service.service_name,
          slug: service.slug,
          errors,
        });

        continue;
      }

      rowsWithValidCategories.push(service);
    }

    // STEP 6: CHECK EXISTING DATABASE DUPLICATES
    // ============================================

    const existingServices =
      rowsWithValidCategories.length > 0
        ? await Service.find({
            $or: [
              {
                slug: {
                  $in: rowsWithValidCategories.map((service) => service.slug),
                },
              },
              ...rowsWithValidCategories.map((service) => ({
                category_id: service.category_id,
                service_name: {
                  $regex: `^${escapeRegex(service.service_name)}$`,
                  $options: "i",
                },
              })),
            ],
          })
            .select("category_id service_name slug")
            .lean()
        : [];

    const existingSlugSet = new Set(
      existingServices.map((service) => normalizeKey(service.slug)),
    );

    const existingNameSet = new Set(
      existingServices.map(
        (service) =>
          `${service.category_id.toString()}:${normalizeKey(
            service.service_name,
          )}`,
      ),
    );

    // STEP 7: IDENTIFY DUPLICATES
    // ============================================

    const newServices = [];

    for (const service of rowsWithValidCategories) {
      const normalizedSlug = normalizeKey(service.slug);

      const normalizedName = normalizeKey(service.service_name);

      const nameKey = `${service.category_id.toString()}:${normalizedName}`;

      const slugExists = existingSlugSet.has(normalizedSlug);
      const nameExists = existingNameSet.has(nameKey);

      if (slugExists || nameExists) {
        duplicateServices.push({
          row_number: service.row_number,
          service_name: service.service_name,
          slug: service.slug,
          reason: [
            ...(slugExists ? ["Service slug already exists."] : []),
            ...(nameExists
              ? ["Service name already exists in this category."]
              : []),
          ],
        });

        continue;
      }

      const { row_number, ...serviceData } = service;

      newServices.push({
        ...serviceData,
        images: [],
        pricing: {
          base_price: service.base_price,
          currency: "INR",
        },
      });

      // Prevent duplicates within the import batch
      existingSlugSet.add(normalizedSlug);
      existingNameSet.add(nameKey);
    }

    // STEP 8: INSERT VALID SERVICES
    // ============================================

    let importedServices = [];

    if (newServices.length > 0) {
      importedServices = await Service.insertMany(newServices, {
        ordered: true,
      });
    }

    // STEP 9: SEND IMPORT REPORT
    // ============================================

    return res.status(200).json({
      success: true,
      message:
        importedServices.length > 0
          ? "Service import completed successfully."
          : "No services were imported. Please check the import report.",
      data: {
        total_rows: rows.length,
        imported_count: importedServices.length,
        duplicate_count: duplicateServices.length,
        invalid_count: invalidServices.length,
        skipped_count: duplicateServices.length + invalidServices.length,

        imported_services: importedServices,
        duplicate_services: duplicateServices,
        invalid_services: invalidServices,
      },
    });
  } catch (error) {
    console.error("Service import error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while importing services.",
      error: error.message,
    });
  }
};
