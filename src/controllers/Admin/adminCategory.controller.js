import mongoose from "mongoose";
import Category from "../../models/Category.js";
import Service from "../../models/Service.js";
import Exceljs from "exceljs";
import PDFDocument from "pdfkit";
import { parse } from "csv-parse/sync";

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
      Category.aggregate([
        // STEP 1: Apply category filters
        {
          $match: filter,
        },

        // STEP 2: Sort categories
        {
          $sort: sort,
        },

        // STEP 3: Pagination
        {
          $skip: skip,
        },
        {
          $limit: limit,
        },

        // STEP 4: Find services belonging to each category
        {
          $lookup: {
            from: Service.collection.name,
            let: {
              categoryId: "$_id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$category_id", "$$categoryId"],
                  },
                },
              },

              // STEP 5: Calculate total and active services
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
            as: "serviceStats",
          },
        },

        // STEP 6: Add counts to category
        {
          $addFields: {
            services_count: {
              $ifNull: [{ $arrayElemAt: ["$serviceStats.total_count", 0] }, 0],
            },

            active_services_count: {
              $ifNull: [{ $arrayElemAt: ["$serviceStats.active_count", 0] }, 0],
            },
          },
        },

        // STEP 7: Remove unnecessary fields
        {
          $project: {
            __v: 0,
            serviceStats: 0,
          },
        },
      ]),

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
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "invalid category id",
      });
    }

    const category = await Category.findById(id).select("-__v").lean();
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Category fetched by id successfully",
      data: { category },
    });
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
    const { id } = req.params;
    const adminId = req.user?.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Category id",
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category not found",
        code: "CATEGORY_NOT_FOUND",
      });
    }

    const allowedFields = [
      "category_name",
      "slug",
      "description",
      "image",
      "icon",
      "is_active",
      "is_featured",
      "sort_order",
      "commission_percentage",
    ];

    const providedFields = Object.keys(req.body);
    if (providedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one field to update.",
        code: "EMPTY_UPDATE",
      });
    }

    const invalidFields = providedFields.filter(
      (field) => !allowedFields.includes(field),
    );
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        code: "INVALID_FIELDS",
        message: "Some fields are not allowed to update.",
        invalid_fields: invalidFields,
      });
    }

    if (Object.hasOwn(req.body, "slug")) {
      if (typeof req.body.slug !== "string") {
        return res.status(400).json({
          success: false,
          message: "Slug must be a String",
          code: "INVALID_SLUG",
        });
      }

      req.body.slug = req.body.slug.trim().toLowerCase();

      const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!slugRegex.test(req.body.slug)) {
        return res.status(400).json({
          success: false,
          message: "please provide a vaid slug",
          code: "INVAID_SLUG",
        });
      }

      const existingSlug = await Category.findOne({
        slug: req.body.slug,
        _id: { $ne: id },
      });
      if (existingSlug) {
        return res.status(400).json({
          success: false,
          message: "This category slug is already in use.",
          code: "CATEGORY_SLUG_EXISTS",
        });
      }
    }

    // Update only provided field
    for (const field of allowedFields) {
      if (Object.hasOwn(req.body, field)) {
        category.set(field, req.body[field]);
      }
    }

    category.updated_by = adminId;

    await category.save();

    return res.status(200).json({
      success: true,
      message: "category updated successfully",
      data: {
        category,
      },
    });
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
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "invalid Category id",
        code: "INVALID_CATEGORY_ID",
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found ",
        code: "CATEGORY_NOT_FOUND",
      });
    }

    const existingServices = await Service.exists({ category_id: id });

    if (existingServices) {
      ((category.is_active = false), (category.update_by = adminId));

      await category.save();

      return res.status(200).json({
        success: true,
        message:
          "Category has been deactivated because services are associated with it.",
        code: "CATEGORY_DEACTIVATED",
        data: {
          category,
          action: "SOFT_DELETE",
        },
      });
    }

    await Category.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "category deleted successfully",
      code: "CATEGORY_DELETED",
      data: {
        category_id: id,
        action: "HARD_DELETE",
      },
    });
  } catch (error) {
    console.error("Delete Category Error:", error.message);

    return res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to delete category.",
    });
  }
};

export const exportCategories = async (req, res) => {
  try {
    // STEP 1: Validate export format
    const format = String(req.query?.format || "xlsx")
      .trim()
      .toLowerCase();

    if (!["xlsx", "csv", "pdf"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid export format. Allowed formats: xlsx, csv, pdf.",
      });
    }

    // STEP 2: Parse active filter
    const parseBoolean = (value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      const normalizedValue = String(value)
        .trim()
        .replace(/^["']|["']$/g, "")
        .toLowerCase();

      if (normalizedValue === "true") return true;
      if (normalizedValue === "false") return false;

      return undefined;
    };

    const isActive = parseBoolean(req.query.is_active);

    if (req.query.is_active !== undefined && isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: "is_active must be either true or false.",
      });
    }

    // STEP 3: Build MongoDB filter
    const filter = {};

    if (isActive !== undefined) {
      filter.is_active = isActive;
    }

    if (req.query.category_id) {
      if (!mongoose.Types.ObjectId.isValid(req.query.category_id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category_id.",
        });
      }

      filter._id = new mongoose.Types.ObjectId(req.query.category_id);
    }

    // STEP 4: Fetch categories
    const categories = await Category.find(filter)
      .select("category_name slug description is_active")
      .sort({ sort_order: 1, createdAt: -1 })
      .lean();

    if (!categories.length) {
      return res.status(404).json({
        success: false,
        message: "No categories found to export.",
      });
    }

    // STEP 5: Create workbook
    const workbook = new Exceljs.Workbook();

    workbook.creator = "Kaamdaar Admin";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Categories");

    // STEP 6: Define only four export columns
    worksheet.columns = [
      { header: "Category Name", key: "category_name", width: 25 },
      { header: "Slug", key: "slug", width: 25, }, 
      { header: "Description", key: "description", width: 45,},
      { header: "Active", key: "is_active", width: 15,},
    ];

    // STEP 7: Add category data
    categories.forEach((category) => {
      worksheet.addRow({
        category_name: category.category_name || "",
        slug: category.slug || "",
        description: category.description || "",
        is_active: category.is_active,
      });
    });

    // STEP 8: Style Excel header
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

    // STEP 9: Enable filters and freeze header
    worksheet.autoFilter = {
      from: "A1",
      to: "D1",
    };

    worksheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    // STEP 10: XLSX EXPORT
    if (format === "xlsx") {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="categories.xlsx"',
      );

      await workbook.xlsx.write(res);
      return res.end();
    }

    // STEP 11: CSV EXPORT
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="categories.csv"',
      );

      await workbook.csv.write(res);
      return res.end();
    }

    // STEP 12: PDF EXPORT
    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="categories.pdf"',
      );

      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 35,
      });

      doc.pipe(res);

      const headers = ["Category Name", "Slug", "Description", "Active"];

      const columnWidths = [150, 150, 350, 80];

      const startX = 35;
      const rowHeight = 30;

      // Draw PDF table header
      const drawTableHeader = (y) => {
        let x = startX;

        doc.font("Helvetica-Bold").fontSize(9);

        headers.forEach((header, index) => {
          doc.text(header, x, y, {
            width: columnWidths[index],
            height: rowHeight,
          });

          x += columnWidths[index];
        });

        return y + rowHeight;
      };

      // PDF title
      doc.font("Helvetica-Bold").fontSize(18);

      doc.text("Categories Export", {
        align: "center",
      });

      doc.moveDown();

      doc.font("Helvetica").fontSize(10);

      doc.text(`Total Categories: ${categories.length}`);

      doc.moveDown();

      let currentY = drawTableHeader(doc.y);

      // Draw category rows
      categories.forEach((category) => {
        if (currentY > 520) {
          doc.addPage({
            size: "A4",
            layout: "landscape",
            margin: 35,
          });

          currentY = drawTableHeader(35);
        }

        const rowData = [
          category.category_name || "",
          category.slug || "",
          category.description || "",
          category.is_active ? "Yes" : "No",
        ];

        let currentX = startX;

        doc.font("Helvetica").fontSize(8);

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
    console.error("Export Categories Error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to export categories.",
      });
    }

    return res.end();
  }
};

// ==================================================
// HELPERS
// ==================================================

const normalizeText = (value) => {
  return String(value ?? "").trim();
};

const normalizeKey = (value) => {
  return normalizeText(value).toLowerCase();
};

const parseBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return null;
};

const parseNumber = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// ==================================================
// READ EXCEL FILE
// ==================================================

const readExcelFile = async (buffer) => {
  const workbook = new Exceljs.Workbook();

  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("Excel file does not contain a worksheet.");
  }

  const headers = [];

  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value || "")
      .trim()
      .toLowerCase();
  });

  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const rowData = {};

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];

      if (header) {
        rowData[header] = cell.value;
      }
    });

    rows.push(rowData);
  });

  return rows;
};

// ==================================================
// READ CSV FILE
// ==================================================

const readCsvFile = (buffer) => {
  return parse(buffer, {
    columns: (headers) =>
      headers.map((header) => String(header).trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
};

export const importCategories = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV or Excel file.",
      });
    }

    // ==============================================
    // STEP 1: CHECK FILE TYPE
    // ==============================================

    const extension = req.file.originalname.split(".").pop().toLowerCase();

    if (!["csv", "xlsx"].includes(extension)) {
      return res.status(400).json({
        success: false,
        message: "Only CSV and XLSX files are allowed.",
      });
    }

    // ==============================================
    // STEP 3: READ FILE
    // ==============================================

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

    // ==============================================
    // STEP 4: VALIDATE ROWS
    // ==============================================

    const validRows = [];
    const invalidCategories = [];
    const duplicateCategories = [];

    const fileNameSet = new Set();
    const fileSlugSet = new Set();

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      const categoryName = normalizeText(row.category_name);
      const slug = normalizeText(row.slug);

      const description = normalizeText(row.description);
      const icon = normalizeText(row.icon);

      const isActive = parseBoolean(row.is_active, true);
      const isFeatured = parseBoolean(row.is_featured, false);

      const sortOrder = parseNumber(row.sort_order, 0);

      const commissionPercentage = parseNumber(row.commission_percentage, 0);

      const errors = [];

      // Required fields
      if (!categoryName) {
        errors.push("category_name is required.");
      }

      if (!slug) {
        errors.push("slug is required.");
      }

      // Boolean validation
      if (isActive === null) {
        errors.push("is_active must be true or false.");
      }

      if (isFeatured === null) {
        errors.push("is_featured must be true or false.");
      }

      // Number validation
      if (sortOrder === null || sortOrder < 0) {
        errors.push("sort_order must be a non-negative number.");
      }

      if (
        commissionPercentage === null ||
        commissionPercentage < 0 ||
        commissionPercentage > 100
      ) {
        errors.push("commission_percentage must be between 0 and 100.");
      }

      // ==============================================
      // CHECK DUPLICATES WITHIN UPLOADED FILE
      // ==============================================

      const normalizedName = normalizeKey(categoryName);
      const normalizedSlug = normalizeKey(slug);

      if (categoryName && fileNameSet.has(normalizedName)) {
        errors.push("Duplicate category_name found in uploaded file.");
      }

      if (slug && fileSlugSet.has(normalizedSlug)) {
        errors.push("Duplicate slug found in uploaded file.");
      }

      // Mark values as seen
      if (categoryName) {
        fileNameSet.add(normalizedName);
      }

      if (slug) {
        fileSlugSet.add(normalizedSlug);
      }

      // ==============================================
      // INVALID ROW
      // ==============================================

      if (errors.length > 0) {
        invalidCategories.push({
          row_number: index + 2,
          category_name: categoryName,
          slug,
          errors,
        });

        continue;
      }

      // ==============================================
      // PREPARE VALID CATEGORY
      // ==============================================

      validRows.push({
        category_name: categoryName,
        slug,
        description,
        icon,
        is_active: isActive,
        is_featured: isFeatured,
        sort_order: sortOrder,
        commission_percentage: commissionPercentage,
        created_by: req.user.id,
      });
    }

    // ==============================================
    // STEP 5: CHECK MONGODB DUPLICATES
    // ==============================================

    const existingCategories = [];

    if (validRows.length > 0) {
      const nameRegexes = validRows.map((category) => ({
        category_name: {
          $regex: `^${escapeRegex(category.category_name)}$`,
          $options: "i",
        },
      }));

      const slugRegexes = validRows.map((category) => ({
        slug: {
          $regex: `^${escapeRegex(category.slug)}$`,
          $options: "i",
        },
      }));

      const existingCategoriesFromDB = await Category.find({
        $or: [...nameRegexes, ...slugRegexes],
      })
        .select("category_name slug")
        .lean();

      existingCategories.push(...existingCategoriesFromDB);
    }

    // ==============================================
    // STEP 6: IDENTIFY DUPLICATES
    // ==============================================

    const existingNameSet = new Set(
      existingCategories.map((category) =>
        normalizeKey(category.category_name),
      ),
    );

    const existingSlugSet = new Set(
      existingCategories.map((category) => normalizeKey(category.slug)),
    );

    const newCategories = [];

    for (const category of validRows) {
      const normalizedName = normalizeKey(category.category_name);

      const normalizedSlug = normalizeKey(category.slug);

      const nameExists = existingNameSet.has(normalizedName);
      const slugExists = existingSlugSet.has(normalizedSlug);

      if (nameExists || slugExists) {
        duplicateCategories.push({
          category_name: category.category_name,
          slug: category.slug,
          reason: [
            ...(nameExists ? ["Category name already exists."] : []),
            ...(slugExists ? ["Slug already exists."] : []),
          ],
        });

        continue;
      }

      newCategories.push(category);

      // Prevent duplicates within this import set
      existingNameSet.add(normalizedName);
      existingSlugSet.add(normalizedSlug);
    }

    // ==============================================
    // STEP 7: INSERT NEW CATEGORIES
    // ==============================================

    let importedCategories = [];

    if (newCategories.length > 0) {
      importedCategories = await Category.insertMany(newCategories, {
        ordered: false,
      });
    }

    // ==============================================
    // STEP 8: RETURN RESPONSE
    // ==============================================

    return res.status(200).json({
      success: true,
      message: "Category import completed successfully.",
      data: {
        total_rows: rows.length,
        imported_count: importedCategories.length,
        duplicate_count: duplicateCategories.length,
        invalid_count: invalidCategories.length,
        skipped_count: duplicateCategories.length + invalidCategories.length,
        imported_categories: importedCategories,
        duplicate_categories: duplicateCategories,
        invalid_categories: invalidCategories,
      },
    });
  } catch (error) {
    console.error("Category import error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while importing categories.",
      error: error.message,
    });
  }
};

export const downloadCategoryImportTemplate = async (req, res) => {
  try {
    // STEP 1: Get requested format
    const format = String(req.query.format || "xlsx")
      .trim()
      .toLowerCase();

    // STEP 2: Validate format
    if (!["xlsx", "csv"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid format. Supported formats are xlsx and csv.",
      });
    }

    // STEP 3: Define template columns
    const columns = [
      "category_name",
      "slug",
      "description",
      "is_active",
      "is_featured",
      "sort_order",
    ];

    // STEP 4: Generate CSV template
    if (format === "csv") {
      const csvContent = columns.join(",") + "\n";

      res.setHeader("Content-Type", "text/csv; charset=utf-8");

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="Category_Import_Template.csv"',
      );

      return res.status(200).send(csvContent);
    }

    // STEP 5: Generate Excel template
    const workbook = new Exceljs.Workbook();

    const worksheet = workbook.addWorksheet("Categories");

    worksheet.columns = [
      { header: "category_name", key: "category_name", width: 25 },
      { header: "slug", key: "slug", width: 25 },
      { header: "description", key: "description", width: 40 },
      { header: "is_active", key: "is_active", width: 15 },
      { header: "is_featured", key: "is_featured", width: 15 },
      { header: "sort_order", key: "sort_order", width: 15 },
    ];

    // STEP 6: Style header row
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

    // STEP 7: Add filter and freeze header
    worksheet.autoFilter = {
      from: "A1",
      to: "F1",
    };

    worksheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    // STEP 8: Generate Excel buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // STEP 9: Send downloadable file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Category_Import_Template.xlsx"',
    );

    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error("Download Category Template Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to download category import template.",
    });
  }
};
