import mongoose, { mongo } from "mongoose";
import Service from "../../models/Service.js";
import Category from "../../models/Category.js";
import SubService from "../../models/SubService.js";

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
    //......  pagination
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    if (!Number.isSafeInteger(page) || page < 1) {
      return res.status(400).json({
        success: false,
        message: "page must be a positive number.",
      });
    }

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "limit must be between 1 and 100.",
      });
    }

    const skip = (page - 1) * limit;

    //.......   SEARCH VALIDATION

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
    // STEP 3: BUILD MONGODB FILTER
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
    // STEP 4: CATEGORY FILTER
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
    // STEP 5: ACTIVE STATUS FILTER
    // ============================================

    if (req.query.is_active !== undefined) {
      if (!["true", "false"].includes(req.query.is_active)) {
        return res.status(400).json({
          success: false,
          message: "is_active must be true or false.",
        });
      }

      filter.is_active = req.query.is_active === "true";
    }

    // ============================================
    // STEP 6: FEATURED FILTER
    // ============================================

    if (req.query.is_featured !== undefined) {
      if (!["true", "false"].includes(req.query.is_featured)) {
        return res.status(400).json({
          success: false,
          message: "is_featured must be true or false.",
        });
      }

      filter.is_featured = req.query.is_featured === "true";
    }

    // ============================================
    // STEP 7: SORT VALIDATION
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

    if (typeof sortOrder !== "string" || !["asc", "desc"].includes(sortOrder)) {
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
    // STEP 8: FETCH SERVICES AND TOTAL COUNT
    // ============================================

    const [services, totalServices] = await Promise.all([
      Service.aggregate([
        {
          $match: filter,
        },

        {
          $sort: sort,
        },

        {
          $skip: skip,
        },
        {
          $limit: limit,
        },

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

              // Calculate total and active sub-services
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

    // ============================================
    // STEP 9: PAGINATION DETAILS
    // ============================================

    const totalPages = Math.ceil(totalServices / limit);

    // ============================================
    // STEP 10: RESPONSE
    // ============================================

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
          has_next_page: page < totalPages,
          has_previous_page: page > 1,
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

    console.log("Category collection:", Category.collection.name);
    console.log("Service collection:", Service.collection.name);
    console.log("Service category ID:", serviceId);

    const categoryCheck = await Category.findById("6afda3b5e2eed8276a1c792c");

    console.log("Category found:", categoryCheck);

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
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service id ",
      });
    }

    const adminId = req.user?.id;
    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Authentication required",
      });
    }

    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    const body = req.body || {};
    const files = req.files || [];
    if (body.remove_images !== undefined) {
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
          message: "remove_images must contain valid public_id strings.",
        });
      }

      removeImageIds = [
        ...new Set(removeImageIds.map((imageId) => imageId.trim())),
      ];
    }

    // STEP 4: VALIDATE REMOVAL REQUEST
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

    const imagesAfterRemoval = existingImages.filter((image) => {
      !removeImageIds.includes(image.public_id);
    });

    // STEP 5: VALIDATE FINAL IMAGE COUNT

    if (imagesAfterRemoval.length + files.length > 5) {
      return res.status(400).json({
        success: false,
        message: "A service can have a maximum of 5 images.",
        current_images: existingImages.length,
        images_to_remove: removeImageIds.length,
        new_images: files.length,
        maximum_images: 5,
      });
    }

    // STEP 6: VALIDATE CATEGORY
    // ========================================

    const nextCategoryId =
      body.category_id !== undefined
        ? body.category_id.trim()
        : service.category_id.toString();

    if (!mongoose.Types.ObjectId.isValid(nextCategoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    const category = await Category.findOne({
      _id: nextCategoryId,
      is_active: true,
    });

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Selected category does not exist or is inactive.",
      });
    }

    // STEP 7: VALIDATE SERVICE NAME
    // ========================================

    const nextServiceName =
      body.service_name !== undefined
        ? body.service_name.trim()
        : service.service_name;

    if (nextServiceName.length < 2 || nextServiceName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Service name must be between 2 and 150 characters.",
      });
    }

    // STEP 8: VALIDATE SLUG
    // ========================================

    const nextSlug =
      body.slug !== undefined ? body.slug.trim().toLowerCase() : service.slug;

    if (nextSlug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nextSlug)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid service slug.",
      });
    }

    // STEP 9: CHECK DUPLICATES
    // ========================================

    const [existingSlug, existingName] = await Promise.all([
      Service.findOne({
        _id: { $ne: service._id },
        slug: nextSlug,
      }).select("_id slug"),

      Service.findOne({
        _id: { $ne: service._id },
        category_id: nextCategoryId,
        service_name: {
          $regex: `^${nextServiceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          $options: "i",
        },
      }).select("_id service_name"),
    ]);

    if (existingSlug) {
      return res.status(409).json({
        success: false,
        message: "This service slug is already in use.",
      });
    }

    if (existingName) {
      return res.status(409).json({
        success: false,
        message: "A service with this name already exists in this category.",
      });
    }

    // STEP 10: VALIDATE DESCRIPTIONS
    // ========================================

    const nextShortDescription =
      body.short_description !== undefined
        ? body.short_description.trim() || null
        : service.short_description;

    const nextDescription =
      body.description !== undefined
        ? body.description.trim() || null
        : service.description;

    if (nextShortDescription && nextShortDescription.length > 250) {
      return res.status(400).json({
        success: false,
        message: "Short description cannot exceed 250 characters.",
      });
    }

    if (nextDescription && nextDescription.length > 3000) {
      return res.status(400).json({
        success: false,
        message: "Description cannot exceed 3000 characters.",
      });
    }

    // STEP 11: VALIDATE PRICING
    // ========================================

    let nextBasePrice = service.pricing.base_price;

    if (body.base_price !== undefined) {
      nextBasePrice = Number(body.base_price);

      if (!Number.isSafeInteger(nextBasePrice) || nextBasePrice < 1) {
        return res.status(400).json({
          success: false,
          message: "Base price must be a positive integer in paise.",
        });
      }
    }

    // STEP 12: VALIDATE DURATION
    // ========================================

    let nextDuration = service.estimated_duration_minutes;

    if (body.estimated_duration_minutes !== undefined) {
      nextDuration = Number(body.estimated_duration_minutes);

      if (
        !Number.isInteger(nextDuration) ||
        nextDuration < 5 ||
        nextDuration > 1440
      ) {
        return res.status(400).json({
          success: false,
          message: "Duration must be between 5 and 1440 minutes.",
        });
      }
    }

    // STEP 13: VALIDATE BOOLEAN FIELDS
    // ========================================

    const parseUpdateBoolean = (value, fieldName) => {
      if (typeof value === "boolean") return value;

      if (value === "true") return true;
      if (value === "false") return false;

      throw new Error(`${fieldName} must be true or false.`);
    };

    let nextIsActive = service.is_active;
    let nextIsFeatured = service.is_featured;

    if (body.is_active !== undefined) {
      nextIsActive = parseUpdateBoolean(body.is_active, "is_active");
    }

    if (body.is_featured !== undefined) {
      nextIsFeatured = parseUpdateBoolean(body.is_featured, "is_featured");
    }

    // STEP 14: VALIDATE SORT ORDER
    // ========================================

    let nextSortOrder = service.sort_order;

    if (body.sort_order !== undefined) {
      nextSortOrder = Number(body.sort_order);

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

    // STEP 15: UPLOAD NEW IMAGES
    // ========================================

    if (files.length > 0) {
      uploadedImages = await uploadMultipleImagesToCloudinary(
        files,
        "kaamdaar/services",
      );
    }

    // STEP 16: UPDATE SERVICE DOCUMENT
    // ========================================

    service.category_id = nextCategoryId;
    service.service_name = nextServiceName;
    service.slug = nextSlug;
    service.short_description = nextShortDescription;
    service.description = nextDescription;

    service.pricing = {
      ...service.pricing.toObject(),
      base_price: nextBasePrice,
      currency: "INR",
    };

    service.estimated_duration_minutes = nextDuration;
    service.is_active = nextIsActive;
    service.is_featured = nextIsFeatured;
    service.sort_order = nextSortOrder;

    service.images = [...imagesAfterRemoval, ...uploadedImages];

    service.updated_by = adminId;

    await service.save();

    // STEP 17: DELETE REMOVED CLOUDINARY IMAGES
    // ========================================

    const deletionResults = await Promise.allSettled(
      existingImages
        .filter((image) => removeImageIds.includes(image.public_id))
        .map((image) => deleteImageFromCloudinary(image.public_id)),
    );

    deletionResults.forEach((result) => {
      if (result.status === "rejected") {
        console.error("Cloudinary image deletion failed:", result.reason);
      }
    });

    // STEP 18: GET UPDATED RELATED DETAILS
    // ========================================

    const [updatedCategory, subServiceCounts] = await Promise.all([
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
            total_count: { $sum: 1 },
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

    updatedService.sub_services_count = subServiceCounts[0]?.total_count || 0;

    updatedService.active_sub_services_count =
      subServiceCounts[0]?.active_count || 0;

    return res.status(200).json({
      success: true,
      message: "Service updated successfully.",
      data: {
        service: updatedService,
      },
    });
  } catch (error) {
    console.error("Update Service Error:", error);

    // ========================================
    // CLEANUP NEWLY UPLOADED IMAGES ON FAILURE
    // ========================================

    if (uploadedImages.length > 0) {
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

    if (error.message?.includes("must be true or false.")) {
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
