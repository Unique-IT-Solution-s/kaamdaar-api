import mongoose from "mongoose";
import Service from "../../models/Service.js";
import SubService from "../../models/SubService.js";
import Exceljs from "exceljs";
import PDFDocument from "pdfkit";

import {
  deleteImageFromCloudinary,
  uploadImageToCloudinary,
} from "../../utils/cloudinary.utils.js";
import Category from "../../models/Category.js";

export const createSubService = async (req, res) => {
  let uploadImage = null;
  try {
    const adminId = req.user?.id;
    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const {
      service_id,
      subservice_name,
      slug,
      description,
      is_active,
      sort_order,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(service_id)) {
      return res.status(400).json({
        success: false,
        message: "Valid service id is requires",
      });
    }

    const service = await Service.findById({
      _id: service_id,
      is_active: true,
    }).select("_id, service_name");
    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Active service not found",
      });
    }

    const normalizedName = String(subservice_name || "").trim();
    if (normalizedName.length < 2 || normalizedName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Sub-service name must be between 2 and 150 characters.",
      });
    }

    const normalizedSlug = String(slug || "")
      .trim()
      .toLowerCase();

    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (normalizedSlug.length > 180 || !slugRegex.test(normalizedSlug)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid slug",
      });
    }

    const normalizedDescription = String(description || "").trim();
    if (!normalizedDescription.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Description cannot exceed 2000 characters.",
      });
    }

    const sortOrder =
      sort_order === undefined || sort_order === "" ? 0 : Number(sort_order);

    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 180) {
      return res.status(400).json({
        success: false,
        message: "sort_order must be an integer between 0 and 10000.",
      });
    }

    let isActive = true;
    if (is_active !== undefined) {
      if (typeof is_active === "boolean") {
        isActive = is_active;
      } else if (["true", "1"].includes(String(is_active).toLowerCase())) {
        isActive = true;
      } else if (["false", "0"].includes(String(is_active).toLowerCase())) {
        isActive = false;
      } else {
        return res.status(400).json({
          success: false,
          message: "is_active must be true or false.",
        });
      }
    }

    const existingName = await SubService.findOne({
      service_id,
      sunservice_name: {
        $regex: `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        $options: "i",
      },
    }).select("_id");
    if (existingName) {
      return res.status(409).json({
        success: false,
        message: "Subservice name already exists under this service ",
      });
    }

    const existingSlug = await SubService.findOne({
      service_id,
      slug: normalizedSlug,
    }).select("_id");
    if (existingSlug) {
      return res.status(409).json({
        success: false,
        message: "slug already exists under this service ",
      });
    }

    let image = {};
    if (req.file) {
      uploadImage = await uploadImageToCloudinary(
        req.file.buffer,
        "kaamdaar/subservices",
      );

      image = {
        url: uploadImage.url,
        public_id: uploadImage.public_id,
      };
    }

    const subService = await SubService.create({
      service_id,
      subservice_name: normalizedName,
      slug: normalizedSlug,
      description: normalizedDescription || null,
      image,
      is_active: isActive,
      sort_order: sortOrder,
      created_by: adminId,
    });

    return res.status(201).json({
      success: true,
      message: "Sub-service is created successfully",
      data: subService,
    });
  } catch (error) {
    if (uploadImage?.public_id) {
      try {
        await deleteImageFromCloudinary(uploadedImage.public_id);
      } catch (cleanupError) {
        console.error("Cloudinary cleanup failed:", cleanupError.message);
      }
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Sub-service slug already exists under this service.",
      });
    }

    console.error("Create SubService Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export const getAllSubServices = async (req, res) => {
  try {
    // ============================================
    // STEP 1: GET USER ROLE
    // ============================================

    const userType = req.user?.user?.user_type ?? req.user?.user_type;
    const isCustomer = userType === "CUSTOMER";

    // ============================================
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

    if (limit === null && page > 1) {
      return res.status(400).json({
        success: false,
        message: "limit is required when page is greater than 1.",
      });
    }

    const skip = limit !== null ? (page - 1) * limit : 0;

    // ============================================
    // STEP 3: GET QUERY PARAMETERS
    // ============================================

    const {
      search,
      service_id,
      category_id,
      is_active,
      sortBy = "sort_order",
      sortOrder = "asc",
    } = req.query;

    // ============================================
    // STEP 4: VALIDATE SERVICE ID
    // ============================================

    if (service_id !== undefined) {
      if (
        typeof service_id !== "string" ||
        !mongoose.isValidObjectId(service_id)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid service_id.",
        });
      }
    }

    // ============================================
    // STEP 5: VALIDATE CATEGORY ID
    // ============================================

    if (category_id !== undefined) {
      if (
        typeof category_id !== "string" ||
        !mongoose.isValidObjectId(category_id)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid category_id.",
        });
      }
    }

    // ============================================
    // STEP 6: ACTIVE STATUS FILTER
    // ============================================

    let activeFilter;

    if (is_active !== undefined) {
      if (typeof is_active !== "string") {
        return res.status(400).json({
          success: false,
          message: "is_active must be true or false.",
        });
      }

      const value = is_active.trim().toLowerCase();

      if (value === "true" || value === "1") {
        activeFilter = true;
      } else if (value === "false" || value === "0") {
        activeFilter = false;
      } else {
        return res.status(400).json({
          success: false,
          message: "is_active must be true or false.",
        });
      }
    }

    // ============================================
    // STEP 7: BUILD SUB-SERVICE FILTER
    // ============================================

    const filter = {};

    if (service_id) {
      filter.service_id = new mongoose.Types.ObjectId(service_id);
    }

    if (activeFilter !== undefined) {
      filter.is_active = activeFilter;
    }

    // ============================================
    // STEP 8: SEARCH FILTER
    // ============================================

    if (search !== undefined && typeof search !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid search parameter.",
      });
    }

    const searchValue = search?.trim();

    if (searchValue) {
      const escapedSearch = searchValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        {
          subservice_name: {
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
    // STEP 9: CUSTOMER RESTRICTIONS
    // ============================================

    if (isCustomer) {
      // Customer must provide service_id or category_id
      if (!service_id && !category_id) {
        return res.status(400).json({
          success: false,
          message: "service_id or category_id is required.",
        });
      }

      // Customer can only see active SubServices
      filter.is_active = true;

      // CASE 1: Customer sends service_id
      if (service_id) {
        const activeService = await Service.findOne({
          _id: new mongoose.Types.ObjectId(service_id),
          is_active: true,
        })
          .select("_id category_id")
          .lean();

        if (!activeService) {
          return res.status(200).json({
            success: true,
            message: "No active service or sub-services found.",
            data: {
              sub_services: [],
              pagination: {
                current_page: page,
                limit,
                total_pages: 0,
                total_sub_services: 0,
                has_next_page: false,
                has_previous_page: false,
              },
            },
          });
        }

        // Check whether the Service's parent Category is active
        const activeCategory = await Category.exists({
          _id: activeService.category_id,
          is_active: true,
        });

        if (!activeCategory) {
          return res.status(200).json({
            success: true,
            message: "No active category or sub-services found.",
            data: {
              sub_services: [],
              pagination: {
                current_page: page,
                limit,
                total_pages: 0,
                total_sub_services: 0,
                has_next_page: false,
                has_previous_page: false,
              },
            },
          });
        }
      }

      // CASE 2: Customer sends category_id
      if (category_id) {
        const activeCategory = await Category.exists({
          _id: new mongoose.Types.ObjectId(category_id),
          is_active: true,
        });

        if (!activeCategory) {
          return res.status(200).json({
            success: true,
            message: "No active category or sub-services found.",
            data: {
              sub_services: [],
              pagination: {
                current_page: page,
                limit,
                total_pages: 0,
                total_sub_services: 0,
                has_next_page: false,
                has_previous_page: false,
              },
            },
          });
        }
      }
    }

    // ============================================
    // STEP 10: SORT VALIDATION
    // ============================================

    const allowedSortFields = [
      "subservice_name",
      "createdAt",
      "updatedAt",
      "sort_order",
    ];

    if (typeof sortBy !== "string" || !allowedSortFields.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sortBy field.",
      });
    }

    if (
      typeof sortOrder !== "string" ||
      !["asc", "desc"].includes(sortOrder.toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "sortOrder must be asc or desc.",
      });
    }

    const sort = {
      [sortBy]: sortOrder.toLowerCase() === "asc" ? 1 : -1,
      _id: 1,
    };

    // ============================================
    // STEP 11: PAGINATION PIPELINE
    // ============================================

    const paginationStages =
      limit !== null ? [{ $skip: skip }, { $limit: limit }] : [];

    // ============================================
    // STEP 12: BUILD SERVICE FILTER
    // ============================================

    const serviceMatch = {};

    // Customers can only see active Services
    if (isCustomer) {
      serviceMatch["service.is_active"] = true;
    }

    // Filter Services by Category
    if (category_id) {
      serviceMatch["service.category_id"] = new mongoose.Types.ObjectId(
        category_id,
      );
    }

    // ============================================
    // STEP 13: FETCH SUB-SERVICES
    // ============================================

    const result = await SubService.aggregate([
      // STEP 1: Match SubServices
      {
        $match: filter,
      },

      // STEP 2: Lookup parent Service
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service_id",
          foreignField: "_id",
          as: "service",
        },
      },

      // STEP 3: Unwind Service
      {
        $unwind: {
          path: "$service",
          preserveNullAndEmptyArrays: !isCustomer,
        },
      },

      // STEP 4: Apply Service and Category filters
      ...(Object.keys(serviceMatch).length > 0
        ? [{ $match: serviceMatch }]
        : []),

      // STEP 5: Sort records
      {
        $sort: sort,
      },

      // STEP 6: Calculate count and fetch data
      {
        $facet: {
          metadata: [
            {
              $count: "total",
            },
          ],

          data: [
            ...paginationStages,

            {
              $project: {
                service_id: 1,
                subservice_name: 1,
                slug: 1,
                description: 1,
                pricing: 1,
                estimated_duration_minutes: 1,
                unit: 1,
                tagline: 1,
                image: 1,
                is_active: 1,
                sort_order: 1,
                created_by: 1,
                updated_by: 1,
                createdAt: 1,
                updatedAt: 1,

                service: {
                  _id: "$service._id",
                  service_name: "$service.service_name",
                  slug: "$service.slug",
                  category_id: "$service.category_id",
                },
              },
            },
          ],
        },
      },
    ]);

    // ============================================
    // STEP 14: PAGINATION DETAILS
    // ============================================

    const subServices = result[0]?.data || [];

    const totalSubServices = result[0]?.metadata?.[0]?.total || 0;

    const totalPages =
      limit !== null
        ? Math.ceil(totalSubServices / limit)
        : totalSubServices > 0
          ? 1
          : 0;

    // ============================================
    // STEP 15: RESPONSE
    // ============================================

    return res.status(200).json({
      success: true,
      message: "Sub-services fetched successfully.",

      data: {
        sub_services: subServices,

        pagination: {
          current_page: page,
          limit,
          total_pages: totalPages,
          total_sub_services: totalSubServices,
          has_next_page: limit !== null && page < totalPages,
          has_previous_page: limit !== null && page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get All SubServices Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export const getSubServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "InValid sub service Id",
      });
    }

    const adminId = req.user?.id;
    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Authentication required",
      });
    }

    const subService = await SubService.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id),
        },
      },
      {
        $lookup: {
          from: "services",
          localField: "service_id",
          foreignField: "_id",
          as: "service",
        },
      },
      {
        $unwind: {
          path: "$service",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          service_id: 1,
          subservice_name: 1,
          slug: 1,
          description: 1,
          image: 1,
          is_active: 1,
          sort_order: 1,
          created_by: 1,
          updated_by: 1,
          createdAt: 1,
          updatedAt: 1,

          service: {
            _id: "$service._id",
            service_name: "$service.service_name",
            slug: "$service.slug",
            category_id: "$service.category_id",
          },
        },
      },
    ]);

    console.log("sub services", subService);

    if (!subService.length) {
      return res.status(404).json({
        success: false,
        message: "Sub services not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "SubService fetched successfully.",
      data: subService[0],
    });
  } catch (error) {
    console.error("Get SubService By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export const updateSubService = async (req, res) => {
  let uploadedImage = null;
  try {
    const { id } = req.params;
    const adminId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid SubService ID.",
      });
    }

    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const subService = await SubService.findById(id);
    if (!subService) {
      return res.status(404).json({
        success: false,
        message: "Subservice not found",
      });
    }

    const serviceId = req.body.service_id ?? subService.service_id;
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Service ID",
      });
    }

    const service = await Service.findOne({
      _id: serviceId,
      is_active: true,
    }).select("_id");

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Active parent Service not found.",
      });
    }

    let subserviceName = subService.subservice_name;

    if (req.body.subservice_name !== undefined) {
      subserviceName = String(req.body.subservice_name).trim();

      if (subserviceName.length < 2 || subserviceName.length > 150) {
        return res.status(400).json({
          success: false,
          message: "Sub-service name must be between 2 and 150 characters.",
        });
      }
    }

    let slug = subService.slug;

    if (req.body?.slug !== undefined) {
      slug = String(req.body?.slug).trim().toLowerCase();

      const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

      if (!slugRegex.test(slug) || slug.length > 180) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid slug.",
        });
      }
    }

    let description = subService.description;

    if (req.body.description !== undefined) {
      description = String(req.body.description).trim();

      if (description.length > 2000) {
        return res.status(400).json({
          success: false,
          message: "Description cannot exceed 2000 characters.",
        });
      }

      description = description || null;
    }

    let isActive = subService.is_active;

    if (req.body.is_active !== undefined) {
      const value = String(req.body.is_active).trim().toLowerCase();

      if (value === "true" || value === "1") {
        isActive = true;
      } else if (value === "false" || value === "0") {
        isActive = false;
      } else {
        return res.status(400).json({
          success: false,
          message: "is_active must be true or false.",
        });
      }
    }

    let sortOrder = subService.sort_order;

    if (req.body.sort_order !== undefined) {
      sortOrder = Number(req.body.sort_order);

      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
        return res.status(400).json({
          success: false,
          message: "sort_order must be an integer between 0 and 10000.",
        });
      }
    }

    const escapedName = subserviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const existingName = await SubService.findOne({
      _id: { $ne: subService._id },
      service_id: serviceId,
      subservice_name: {
        $regex: `^${escapedName}$`,
        $options: "i",
      },
    }).select("_id");

    if (existingName) {
      return res.status(409).json({
        success: false,
        message: "Sub-service name already exists under this service.",
      });
    }

    const existingSlug = await SubService.findOne({
      _id: { $ne: subService._id },
      service_id: serviceId,
      slug,
    }).select("_id");

    if (existingSlug) {
      return res.status(409).json({
        success: false,
        message: "Slug already exists under this service.",
      });
    }

    let removeImage = false;

    if (req.body.remove_image !== undefined) {
      const value = String(req.body.remove_image).trim().toLowerCase();

      if (value === "true" || value === "1") {
        removeImage = true;
      } else if (value !== "false" && value !== "0") {
        return res.status(400).json({
          success: false,
          message: "remove_image must be true or false.",
        });
      }
    }

    if (req.file && removeImage) {
      return res.status(400).json({
        success: false,
        message: "Upload a new image or remove the existing image, not both.",
      });
    }

    const oldImagePublicId = subService.image?.public_id || null;

    // STEP 13: Upload replacement image if provided
    if (req.file) {
      uploadedImage = await uploadImageToCloudinary(
        req.file.buffer,
        "kaamdaar/subservices",
      );

      const imageUrl = uploadedImage.secure_url || uploadedImage.url;

      if (!imageUrl || !uploadedImage.public_id) {
        throw new Error("Cloudinary did not return valid image details.");
      }

      subService.image = {
        url: imageUrl,
        public_id: uploadedImage.public_id,
      };
    } else if (removeImage) {
      subService.image = {
        url: null,
        public_id: null,
      };
    }

    subService.service_id = serviceId;
    subService.subservice_name = subserviceName;
    subService.slug = slug;
    subService.description = description;
    subService.is_active = isActive;
    subService.sort_order = sortOrder;
    subService.updated_by = adminId;

    // STEP 15: Save database changes
    await subService.save();

    // STEP 16: Delete old image only after successful DB update
    const imageWasReplacedOrRemoved =
      Boolean(oldImagePublicId) && (Boolean(req.file) || removeImage);

    if (
      imageWasReplacedOrRemoved &&
      oldImagePublicId &&
      oldImagePublicId !== uploadedImage?.public_id
    ) {
      try {
        await deleteImageFromCloudinary(oldImagePublicId);
      } catch (cleanupError) {
        console.error(
          "Old SubService image cleanup failed:",
          cleanupError.message,
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "SubService updated successfully.",
      data: subService,
    });
  } catch (error) {
    if (uploadedImage?.public_id) {
      try {
        await deleteImageFromCloudinary(uploadedImage.public_id);
      } catch (cleanupError) {
        console.error(
          "New SubService image cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "SubService slug already exists under this service.",
      });
    }

    console.error("Update SubService Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export const deleteSubService = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid SubService ID.",
      });
    }

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const subService = await SubService.findById(id);

    if (!subService) {
      return res.status(404).json({
        success: false,
        message: "SubService not found.",
      });
    }

    // STEP 1: Get Cloudinary public_id
    const imagePublicId = subService.image?.public_id || null;

    // STEP 2: Hard Delete from MongoDB
    await SubService.deleteOne({ _id: subService._id });

    // STEP 3: Delete Image from Cloudinary
    let cloudinaryDeleted = null;

    if (imagePublicId) {
      try {
        const result = await deleteImageFromCloudinary(imagePublicId);

        cloudinaryDeleted =
          result?.result === "ok" || result?.result === "not found";
      } catch (cloudinaryError) {
        console.error(
          "Cloudinary SubService image deletion failed:",
          cloudinaryError,
        );

        cloudinaryDeleted = false;
      }
    }

    // STEP 4: Send Response
    return res.status(200).json({
      success: true,
      message: "SubService permanently deleted from database.",
      data: {
        _id: subService._id,
        subservice_name: subService.subservice_name,
        image_public_id: imagePublicId,
        database_deleted: true,
        cloudinary_deleted: cloudinaryDeleted,
      },
    });
  } catch (error) {
    console.error("Delete SubService Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export const exportSubServices = async (req, res) => {
  try {
    const { format = "xlsx", service_id, is_active, search } = req.query;
    const exportFormat = String(format).trim().toLowerCase();

    if (!["xlsx", "csv", "pdf"].includes(exportFormat)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Use xlsx, csv, or pdf.",
      });
    }

    const match = {};

    if (service_id) {
      if (!mongoose.Types.ObjectId.isValid(service_id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Service Id",
        });
      }

      match.service_id = new mongoose.Types.ObjectId(service_id);
    }

    if (is_active !== undefined) {
      const activeValue = String(is_active).trim().toLowerCase();

      if (!["true", "false"].includes(activeValue)) {
        return res.status(400).json({
          success: false,
          message: "is_active must be true or false.",
        });
      }
      match.is_active = activeValue === "true";
    }

    if (search && String(search).trim()) {
      const escapedSearch = String(search)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      match.$or = [
        { subservice_name: { $regex: escapedSearch, $options: "i" } },
        { slug: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const subServices = await SubService.aggregate([
      {
        $match: match,
      },
      {
        $lookup: {
          from: "services",
          localField: "service_id",
          foreignField: "_id",
          as: "service",
        },
      },
      {
        $unwind: {
          path: "$service",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: {
          sort_order: 1,
          createdAt: -1,
        },
      },
      {
        $project: {
          _id: 1,
          subservice_name: "$subservice_name",
          slug: 1,
          service_name: "$service.service_name",
          description: 1,
          is_active: 1,
          image_url: "$image.url",
          createdAt: {
            $ifNull: ["$createdAt", "$updatedAt"],
          },
        },
      },
    ]);

    // console.log(
    //   "SubServices aggregation result:",
    //   JSON.stringify(subServices, null, 2),
    // );

    if (!subServices.length) {
      return res.status(400).json({
        success: false,
        message: "No subService found for export",
      });
    }

    // STEP 1: Prepare export rows
    const rows = subServices.map((item) => ({
      "SubService Name": item.subservice_name || "",
      Slug: item.slug || "",
      "Service Name": item.service_name || "",
      Description: item.description || "",
      "Active Status": item.is_active ? "Yes" : "No",
      "Image URL": item.image_url || "",
      "Created At": item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN")
        : "",
    }));

    // console.log("Aggregation first record:", subServices[0]);
    // console.log("Excel first row:", rows[0]);
    // console.log("SubService Name value:", subServices[0]?.subservice_name);

    const fileName = `subservices_${Date.now()}`;

    // Export Excel
    if (exportFormat === "xlsx") {
      const workbook = new Exceljs.Workbook();
      const worksheet = workbook.addWorksheet("SubServices");

      // STEP 1: Define columns with simple keys
      worksheet.columns = [
        { header: "SubService Name", key: "subservice_name", width: 30 },
        { header: "Slug", key: "slug", width: 30 },
        { header: "Service Name", key: "service_name", width: 30 },
        { header: "Description", key: "description", width: 45 },
        { header: "Active Status", key: "active_status", width: 15 },
        { header: "Image URL", key: "image_url", width: 50 },
        { header: "Created At", key: "created_at", width: 25 },
      ];

      // STEP 2: Prepare Excel rows
      const excelRows = subServices.map((item) => ({
        subservice_name: item.subservice_name || "",
        slug: item.slug || "",
        service_name: item.service_name || "",
        description: item.description || "",
        active_status: item.is_active ? "Yes" : "No",
        image_url: item.image_url || "",
        created_at: item.createdAt
          ? new Date(item.createdAt).toLocaleString("en-IN")
          : "",
      }));

      // STEP 3: Add rows only once
      worksheet.addRows(excelRows);

      // STEP 4: Style header
      worksheet.getRow(1).font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
      };

      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E78" },
      };

      // STEP 5: Freeze header and enable filter
      worksheet.views = [{ state: "frozen", ySplit: 1 }];

      worksheet.autoFilter = {
        from: "A1",
        to: "G1",
      };

      // STEP 6: Generate Excel buffer
      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}.xlsx"`,
      );

      return res.status(200).send(Buffer.from(buffer));
    }

    // : Export CSV
    if (exportFormat === "csv") {
      const workbook = new Exceljs.Workbook();
      const worksheet = workbook.addWorksheet("SubServices");

      worksheet.columns = [
        { header: "SubService Name", key: "subservice_name" },
        { header: "Slug", key: "slug" },
        { header: "Service Name", key: "service_name" },
        { header: "Description", key: "description" },
        { header: "Active Status", key: "active_status" },
        { header: "Image URL", key: "image_url" },
        { header: "Created At", key: "created_at" },
      ];

      const csvRows = subServices.map((item) => ({
        subservice_name: item.subservice_name || "",
        slug: item.slug || "",
        service_name: item.service_name || "",
        description: item.description || "",
        active_status: item.is_active ? "Yes" : "No",
        image_url: item.image_url || "",
        created_at: item.createdAt
          ? new Date(item.createdAt).toLocaleString("en-IN")
          : "",
      }));

      worksheet.addRows(csvRows);

      const buffer = await workbook.csv.writeBuffer();

      res.setHeader("Content-Type", "text/csv; charset=utf-8");

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}.csv"`,
      );

      return res.status(200).send(Buffer.from(buffer));
    }

    // Export Pdf
    if (exportFormat === "pdf") {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 30,
        bufferPages: true,
      });

      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));

      const pdfBufferPromise = new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
      });

      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .text("SubServices Export", { align: "center" });

      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(`Total SubServices: ${rows.length}`);

      doc.moveDown();

      rows.forEach((item, index) => {
        const rowText = [
          `${index + 1}. ${item["SubService Name"]}`,
          `Slug: ${item["Slug"]}`,
          `Service: ${item["Service Name"]}`,
          `Description: ${item["Description"] || "-"}`,
          `Active Status: ${item["Active Status"]}`,
          `Image URL: ${item["Image URL"] || "-"}`,
          `Created At: ${item["Created At"] || "-"}`,
        ].join("\n");

        const requiredHeight = doc.heightOfString(rowText, { width: 770 }) + 16;

        if (doc.y + requiredHeight > doc.page.height - 35) {
          doc.addPage();
        }

        doc.fontSize(8).font("Helvetica").text(rowText, {
          width: 770,
        });

        doc.moveDown(0.6);
      });

      doc.end();

      const pdfBuffer = await pdfBufferPromise;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}.pdf"`,
      );

      return res.status(200).send(pdfBuffer);
    }
  } catch (error) {
    console.error("Export SubServices Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to export SubServices.",
    });
  }
};
