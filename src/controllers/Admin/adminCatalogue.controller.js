import mongoose from "mongoose";

import Category from "../../models/Category.js";
import Service from "../../models/Service.js";
import SubService from "../../models/SubService.js";
import ExcelJS from "exceljs";

import {
  readCsvFile,
  readExcelFile,
  normalizeText,
  normalizeKey,
} from "../../utils/importExport.utils.js";

// Generate URL-friendly slugs.
const generateSlug = (value) => {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// Convert rupees to paise safely.
const rupeesToPaise = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const rupees = Number(value);

  if (!Number.isFinite(rupees) || rupees <= 0) {
    return null;
  }

  const paise = Math.round(rupees * 100);

  if (!Number.isSafeInteger(paise)) {
    return null;
  }

  // Reject values with more than two decimal places.
  if (Math.abs(rupees * 100 - paise) > 0.000001) {
    return null;
  }

  return paise;
};

const parseDuration = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const duration = Number(value);

  if (!Number.isInteger(duration) || duration <= 0) {
    return null;
  }

  return duration;
};

const parseSortOrder = (value, fallback = 0) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number < 0 || number > 10000) {
    return null;
  }

  return number;
};

// Escape text before using it in a regular expression.
const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Find an existing Category by name.
const findCategoryByName = async (name, session) => {
  return Category.findOne({
    category_name: {
      $regex: `^${escapeRegex(name)}$`,
      $options: "i",
    },
  }).session(session);
};

// Find an existing Service within its Category.
const findServiceByName = async (categoryId, name, session) => {
  return Service.findOne({
    category_id: categoryId,
    service_name: {
      $regex: `^${escapeRegex(name)}$`,
      $options: "i",
    },
  }).session(session);
};

// Find an existing SubService within its Service.
const findSubServiceByName = async (serviceId, name, session) => {
  return SubService.findOne({
    service_id: serviceId,
    subservice_name: {
      $regex: `^${escapeRegex(name)}$`,
      $options: "i",
    },
  }).session(session);
};

// Generate a globally unique Service slug.
const generateUniqueServiceSlug = async (name, session) => {
  const baseSlug = generateSlug(name);

  let slug = baseSlug;
  let counter = 1;

  while (await Service.exists({ slug }).session(session)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

// Generate a unique SubService slug within its parent Service.
const generateUniqueSubServiceSlug = async (serviceId, name, session) => {
  const baseSlug = generateSlug(name);

  let slug = baseSlug;
  let counter = 1;

  while (
    await SubService.exists({
      service_id: serviceId,
      slug,
    }).session(session)
  ) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

export const importCatalogue = async (req, res) => {
  let session;

  try {
    // STEP 1: Validate uploaded file.
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

    const adminId = req.user?.id;

    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(401).json({
        success: false,
        message: "Valid admin authentication is required.",
      });
    }

    // STEP 2: Read file.
    const rows =
      extension === "csv"
        ? readCsvFile(req.file.buffer)
        : await readExcelFile(req.file.buffer);

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "The uploaded file is empty.",
      });
    }

    if (rows.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Maximum 500 rows are allowed per import.",
      });
    }

    // STEP 3: Prepare import counters.
    const summary = {
      total_rows: rows.length,

      categories_created: 0,
      categories_reused: 0,

      services_created: 0,
      services_reused: 0,

      subservices_created: 0,
      duplicate_subservices: 0,

      invalid_rows: 0,
      skipped_rows: 0,
    };

    const invalidRows = [];
    const duplicateRows = [];

    // Track duplicate rows within this uploaded file.
    const processedSubServiceKeys = new Set();

    // STEP 4: Validate all rows before writing to MongoDB.
    const validRows = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;
      const errors = [];

      const categoryName = normalizeText(row.category_name_en);
      const serviceName = normalizeText(row.service_name_en);
      const subServiceName = normalizeText(row.sub_service_name_en);

      const categoryOrder = parseSortOrder(row.category_order, 0);
      const serviceOrder = parseSortOrder(row.service_order, 0);

      const servicePrice = rupeesToPaise(row.service_price);
      const serviceDuration = parseDuration(row.service_duration_minutes);

      const subServicePrice = rupeesToPaise(row.sub_service_price);

      const subServiceDuration = parseDuration(
        row.sub_service_duration_minutes,
      );

      // Required names.
      if (!categoryName || categoryName.length < 2) {
        errors.push("category_name_en is required.");
      }

      if (!serviceName || serviceName.length < 2) {
        errors.push("service_name_en is required.");
      }

      if (!subServiceName || subServiceName.length < 2) {
        errors.push("sub_service_name_en is required.");
      }

      // Service price and duration are required by your Service schema.
      if (servicePrice === null) {
        errors.push("service_price must be a valid positive rupee amount.");
      }

      if (
        serviceDuration === null ||
        serviceDuration < 5 ||
        serviceDuration > 1440
      ) {
        errors.push("service_duration_minutes must be between 5 and 1440.");
      }

      if (categoryOrder === null) {
        errors.push("category_order must be between 0 and 10000.");
      }

      if (serviceOrder === null) {
        errors.push("service_order must be between 0 and 10000.");
      }

      // SubService price and duration are optional, but if supplied
      // they must be valid.
      if (normalizeText(row.sub_service_price) && subServicePrice === null) {
        errors.push("sub_service_price must be a valid positive rupee amount.");
      }

      if (
        normalizeText(row.sub_service_duration_minutes) &&
        subServiceDuration === null
      ) {
        errors.push(
          "sub_service_duration_minutes must be a positive whole number.",
        );
      }

      const categoryKey = normalizeKey(categoryName);
      const serviceKey = normalizeKey(serviceName);
      const subServiceKey = normalizeKey(subServiceName);

      // A SubService is unique within its Service.
      const duplicateKey = [categoryKey, serviceKey, subServiceKey].join("::");

      if (processedSubServiceKeys.has(duplicateKey)) {
        errors.push("Duplicate SubService found within the uploaded file.");
      }

      if (errors.length > 0) {
        summary.invalid_rows++;

        invalidRows.push({
          row_number: rowNumber,
          category_name: categoryName,
          service_name: serviceName,
          subservice_name: subServiceName,
          errors,
        });

        continue;
      }

      processedSubServiceKeys.add(duplicateKey);

      validRows.push({
        row_number: rowNumber,

        category_name: categoryName,
        category_slug: generateSlug(categoryName),
        category_order: categoryOrder,

        service_name: serviceName,
        service_slug: generateSlug(serviceName),
        service_price: servicePrice,
        service_duration: serviceDuration,
        service_unit: normalizeText(row.service_unit) || "per task",
        service_tagline: normalizeText(row.service_tagline),
        service_description: normalizeText(row.service_description_en),
        service_order: serviceOrder,

        subservice_name: subServiceName,
        subservice_slug: generateSlug(subServiceName),
        subservice_price: subServicePrice,
        subservice_duration: subServiceDuration,
        subservice_unit: normalizeText(row.sub_service_unit) || "per task",
        subservice_tagline: normalizeText(row.sub_service_tagline),
        subservice_description: normalizeText(row.sub_service_description_en),
      });
    }

    if (validRows.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No valid catalogue rows found.",
        data: {
          ...summary,
          skipped_rows: summary.invalid_rows,
          invalid_rows_details: invalidRows,
          duplicate_rows_details: duplicateRows,
        },
      });
    }

    // STEP 5: Start MongoDB transaction.
    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      const categoryCache = new Map();
      const serviceCache = new Map();

      for (const row of validRows) {
        // =========================================
        // A. CREATE OR REUSE CATEGORY
        // =========================================

        const categoryKey = normalizeKey(row.category_name);

        let category = categoryCache.get(categoryKey);

        if (!category) {
          category = await findCategoryByName(row.category_name, session);

          if (category) {
            summary.categories_reused++;
          } else {
            category = await Category.create(
              [
                {
                  category_name: row.category_name,
                  slug: row.category_slug,
                  sort_order: row.category_order,
                  created_by: adminId,
                },
              ],
              { session },
            );

            category = category[0];
            summary.categories_created++;
          }

          categoryCache.set(categoryKey, category);
        }

        // =========================================
        // B. CREATE OR REUSE SERVICE
        // =========================================

        const serviceKey = `${category._id}::${normalizeKey(row.service_name)}`;

        let service = serviceCache.get(serviceKey);

        if (!service) {
          service = await findServiceByName(
            category._id,
            row.service_name,
            session,
          );

          if (service) {
            summary.services_reused++;
          } else {
            const serviceSlug = await generateUniqueServiceSlug(
              row.service_name,
              session,
            );

            service = await Service.create(
              [
                {
                  category_id: category._id,
                  service_name: row.service_name,
                  slug: serviceSlug,

                  pricing: {
                    base_price: row.service_price,
                    currency: "INR",
                  },

                  estimated_duration_minutes: row.service_duration,

                  service_unit: row.service_unit,
                  service_tagline: row.service_tagline,
                  description: row.service_description,

                  sort_order: row.service_order,

                  created_by: adminId,
                },
              ],
              { session },
            );

            service = service[0];
            summary.services_created++;
          }

          serviceCache.set(serviceKey, service);
        }

        // =========================================
        // C. CREATE OR SKIP SUBSERVICE
        // =========================================

        const existingSubService = await findSubServiceByName(
          service._id,
          row.subservice_name,
          session,
        );

        if (existingSubService) {
          summary.duplicate_subservices++;

          duplicateRows.push({
            row_number: row.row_number,
            subservice_name: row.subservice_name,
            reason: "SubService already exists under this Service.",
          });

          continue;
        }

        const subServiceSlug = await generateUniqueSubServiceSlug(
          service._id,
          row.subservice_name,
          session,
        );

        await SubService.create(
          [
            {
              service_id: service._id,

              subservice_name: row.subservice_name,
              slug: subServiceSlug,

              description: row.subservice_description,

              pricing: {
                base_price: row.subservice_price,
                currency: "INR",
              },

              estimated_duration_minutes: row.subservice_duration,

              unit: row.subservice_unit,
              tagline: row.subservice_tagline,

              created_by: adminId,
            },
          ],
          { session },
        );

        summary.subservices_created++;
      }
    });

    // STEP 6: End transaction.
    await session.endSession();
    session = null;

    summary.skipped_rows = summary.invalid_rows + summary.duplicate_subservices;

    // STEP 7: Send response.
    return res.status(200).json({
      success: true,
      message: "Catalogue import completed successfully.",
      data: {
        ...summary,
        invalid_rows_details: invalidRows,
        duplicate_rows_details: duplicateRows,
      },
    });
  } catch (error) {
    console.error("Catalogue Import Error:", error);

    if (session) {
      await session.endSession().catch(() => {});
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong while importing the catalogue.",
      error: error.message,
    });
  }
};

export const downloadCatalogueImportTemplate = async (req, res) => {
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

    // STEP 3: Define Catalogue template columns
    const columns = [
      "category_name_en",
      "category_order",
      "service_name_en",
      "service_price",
      "service_duration_minutes",
      "service_unit",
      "service_tagline",
      "service_description_en",
      "service_order",
      "sub_service_name_en",
      "sub_service_price",
      "sub_service_duration_minutes",
      "sub_service_unit",
      "sub_service_tagline",
      "sub_service_description_en",
    ];

    // STEP 4: Generate CSV template
    if (format === "csv") {
      const csvContent = columns.join(",") + "\n";

      res.setHeader("Content-Type", "text/csv; charset=utf-8");

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="Catalogue_Import_Template.csv"',
      );

      return res.status(200).send(csvContent);
    }

    // STEP 5: Generate Excel template
    const workbook = new ExcelJS.Workbook();

    const worksheet = workbook.addWorksheet("Catalogue");

    worksheet.columns = [
      {
        header: "category_name_en",
        key: "category_name_en",
        width: 25,
      },
      {
        header: "category_order",
        key: "category_order",
        width: 15,
      },
      {
        header: "service_name_en",
        key: "service_name_en",
        width: 25,
      },
      {
        header: "service_price",
        key: "service_price",
        width: 15,
      },
      {
        header: "service_duration_minutes",
        key: "service_duration_minutes",
        width: 25,
      },
      {
        header: "service_unit",
        key: "service_unit",
        width: 18,
      },
      {
        header: "service_tagline",
        key: "service_tagline",
        width: 30,
      },
      {
        header: "service_description_en",
        key: "service_description_en",
        width: 40,
      },
      {
        header: "service_order",
        key: "service_order",
        width: 15,
      },
      {
        header: "sub_service_name_en",
        key: "sub_service_name_en",
        width: 25,
      },
      {
        header: "sub_service_price",
        key: "sub_service_price",
        width: 18,
      },
      {
        header: "sub_service_duration_minutes",
        key: "sub_service_duration_minutes",
        width: 30,
      },
      {
        header: "sub_service_unit",
        key: "sub_service_unit",
        width: 20,
      },
      {
        header: "sub_service_tagline",
        key: "sub_service_tagline",
        width: 30,
      },
      {
        header: "sub_service_description_en",
        key: "sub_service_description_en",
        width: 40,
      },
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
      wrapText: true,
    };

    headerRow.height = 35;

    // STEP 7: Add filter and freeze header
    worksheet.autoFilter = {
      from: "A1",
      to: "O1",
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
      'attachment; filename="Catalogue_Import_Template.xlsx"',
    );

    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error("Download Catalogue Template Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to download catalogue import template.",
    });
  }
};
