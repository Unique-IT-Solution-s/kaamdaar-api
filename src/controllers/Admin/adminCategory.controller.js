import mongoose from "mongoose";
import Category from "../../models/Category.js";
import { type } from "os";

export const createCategory = async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId || !mongoose.isValidObjectId(adminId)) {
      return res.status(401).json({
        success: false,
        message: "Valid admin authentication is required.",
      });
    }
    const {
      category_name,
      slug,
      description,
      image,
      icon,
      is_active,
      is_featured,
      sort_order,
      commission_percentage,
    } = req.body;
    if (!typeof category_name === "string" || !category_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "category name is required",
      });
    }

    if (!typeof slug || !slug.trim()) {
      return res.status(400).json({
        success: false,
        message: "category slug is required",
      });
    }

    const normalizedSlug = slug.trim().toLowerCase();

    const existingCategory = await Category.findOne({ slug: normalizedSlug });
    if (existingCategory) {
      return res.status(409).json({
        success: false,
        message: "category is already exist",
      });
    }

    const categoryData = {
      category_name: category_name.trim(),
      slug: normalizedSlug,
      description,
      image,
      icon,
      is_active,
      is_featured,
      sort_order,
      commission_percentage,
      created_by: adminId,
    };

    const category = await Category.create(categoryData);

    return res.status(201).json({
      success: true,
      message: "category is created successfully",
      data: { category },
    });
  } catch (error) {
    console.error("Create category error:", error.message);

    // Handle duplicate slug race condition
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        code: "CATEGORY_SLUG_ALREADY_EXISTS",
        message: "A category with this slug already exists.",
      });
    }

    // Handle Mongoose validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Category validation failed.",
        errors: Object.values(error.errors).map((item) => item.message),
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create category.",
    });
  }
};

export const getCategories = async (req, res) => {
  try {
    const page = Number(req.query?.page ?? 1);
    const limit = Number(req.query?.limit ?? 10);

    if (!Number.isSafeInteger(page) || page < 1) {
      return res.status(400).json({
        success: false,
        message: "page must be a poitive number",
      });
    }

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "limit must be between i to 100",
      });
    }

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    if (
      req.query.search !== undefined &&
      typeof req.query.search !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid search parameter.",
      });
    }

    const filter = {};
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.category_name = {
        $regex: escapedSearch,
        $option: "i",
      };
    }

    if (req.query.is_active !== undefined) {
      if (!["true", "false"].includes(req.query.is_active)) {
        return res.status(400).json({
          success: false,
          message: "is_active must be true or false",
        });
      }
      filter.is_active = req.query.is_active === "true";
    }

    if (req.query.is_featured !== undefined) {
      if (!["true", "false"].includes(req.query.is_featured)) {
        return res.status(400).json({
          success: false,
          message: "is_featured must be true or false",
        });
      }
      filter.is_featured = req.query.is_featured === "true";
    }

    const allowedSortFields = [
      "category_name",
      "createdAt",
      "updatedAt",
      "sort_order",
    ];

    const sortOrder = req.query.sort_order ?? "asc";
    const sort_by = req.query.sort_by ?? "sort_order";

    if (!allowedSortFields.includes(sort_by)) {
      return res.status(400).json({
        success: false,
        message: "Invaid sort by field",
      });
    }

    if (!["asc", "desc"].includes(sortOrder)) {
      return res.status(400).json({
        success: false,
        message: "sort_order must be asc or desc.",
      });
    }

    const skip = Number(page - 1) * Number(limit);

    // Build sorting
    const sort = {
      [sort_by]: sortOrder === "asc" ? 1 : -1,
      _id: 1,
    };

    //. Fetch categories and count
    const [categories, totalCategories] = await Promise.all([
      Category.find(filter)
        .select("-__v")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Category.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCategories / limit);

    return res.status(200).json({
      success: true,
      message: "Category fetch successfully",
      data: {
        categories,
        pagination: {
          current_page: page,
          limit,
          total_pages: totalPages,
          total_categories: totalCategories,
          has_next_page: page < totalPages,
          has_previous_page: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get categories error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch categories.",
    });
  }
};

export const getCategoryById = async (req, res) => {
  try {
    const {id} = req.params; 
    if(!mongoose.isValidObjectId(id)){
        return res.status(400).json({
            success : false ,
            message : "invalid category id"
        })
    }

    const category = await Category.findById(id).select("-__v").lean();
    if(!category){
        return res.status(404).json({
            success: false ,
            message : "Category not found"
        })
    }

    return res.status(200).json({
        success : true, 
        message : "Category fetched by id successfully",
        data : { category}
    })
  } catch (error) {
    console.error("Get category details error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch category details.",
    });
  }
};


export const updateCategory = async (req, res) => {
    try {
       const {id} = req.params;
       const adminId = req.user?.id;
       
       if(!mongoose.isValidObjectId(id)){
        return res.status(400).json({
            success : false ,
            message : "Invalid Category id"
        })
       }

       const category = await Category.findById(id)
       if(!category){
         return res.status(400).json({
            success : false ,
            message : "Category not found",
            code : "CATEGORY_NOT_FOUND"
         })
       }

       const allowedFields = ["category_name", "slug", "description", "image", "icon", "is_active", "is_featured", "sort_order", "commission_percentage"]
       
       const providedFields = Object.keys(req.body)
       if(providedFields.length === 0){
        return res.status(400).json({
            success : false ,
            message : "Please provide at least one field to update.",
            code: "EMPTY_UPDATE",
        })
       }

       const invalidFields = providedFields.filter((field) => !allowedFields.includes(field))
       if(invalidFields.length > 0 ){
        return res.status(400).json({
            success : false ,
            code : "INVALID_FIELDS",
            message : "Some fields are not allowed to update.",
            invalid_fields: invalidFields,
        })
       }

       if(Object.hasOwn(req.body, "slug")){
        if(typeof req.body.slug !== "string"){
            return res.status(400).json({
                success : false ,
                message : "Slug must be a String",
                code : "INVALID_SLUG"
            })
        }

        req.body.slug = req.body.slug.trim().toLowerCase();

        const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
        if(!slugRegex.test(req.body.slug)){
            return res.status(400).json({
                success : false ,
                message : "please provide a vaid slug",
                code : "INVAID_SLUG"
            })
        }

        const existingSlug = await Category.findOne({
            slug : req.body.slug,
            _id : {$ne : id}
        })
        if(existingSlug){
            return res.status(400).json({
                success : false ,
                message : "This category slug is already in use.",
                code : "CATEGORY_SLUG_EXISTS"
            })
        }
       }

       // Update only provided field
       for(const field of allowedFields){
        if(Object.hasOwn(req.body, field)){
            category.set(field, req.body[field])
        }
       }

       category.updated_by = adminId

       await category.save();

       return res.status(200).json({
        success : true,
        message : "category updated successfully",
        data : {
            category
        }
       })

    } catch (error) {
        console.error("Update Category Error:", error.message);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CATEGORY_SLUG",
        message: "This category slug is already in use.",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to update category.",
    });
    }
}