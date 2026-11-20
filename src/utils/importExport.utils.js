import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";

// Normalize text
export const normalizeText = (value) => {
  return String(value ?? "").trim();
};

// Normalize keys for duplicate checking
export const normalizeKey = (value) => {
  return normalizeText(value).toLowerCase();
};

// Parse boolean values
export const parseBoolean = (value, defaultValue = true) => {
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

// Parse numbers
export const parseNumber = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

// Escape regular expressions
export const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Read Excel file
export const readExcelFile = async (buffer) => {
  const workbook = new ExcelJS.Workbook();

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

// Read CSV file
export const readCsvFile = (buffer) => {
  return parse(buffer, {
    columns: (headers) =>
      headers.map((header) => String(header).trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
};
