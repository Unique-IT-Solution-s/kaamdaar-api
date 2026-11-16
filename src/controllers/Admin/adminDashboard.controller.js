import { getAdminDashboardSummary, getAdminBookingStats, getLiveBookings, } from "../../services/admin/dashboard.service.js";

export const getDashboardSummary = async (req, res) => {
  try {
    const data = await getAdminDashboardSummary(req.query);

    return res.status(200).json({
      success: true,
      message: "Dashboard summary fetched successfully.",
      data,
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);

    const isDateError = [
      "Both from and to dates are required.",
      "Dates must use YYYY-MM-DD format.",
      "Invalid date range.",
      "The from date cannot be after the to date.",
    ].includes(error.message);

    return res.status(isDateError ? 400 : 500).json({
      success: false,
      message: isDateError
        ? error.message
        : "Unable to fetch dashboard summary.",
    });
  }
};

export const getBookingStats = async (req, res) => {
  try {
    const data = await getAdminBookingStats(req.query);

    return res.status(200).json({
      success: true,
      message: "Booking statistics fetched successfully.",
      data,
    });
  } catch (error) {
    console.error("Booking statistics error:", error);

    const isDateError = [
      "Both from and to dates are required.",
      "Dates must use YYYY-MM-DD format.",
      "Invalid date range.",
      "The from date cannot be after the to date.",
    ].includes(error.message);

    return res.status(isDateError ? 400 : 500).json({
      success: false,
      message: isDateError
        ? error.message
        : "Unable to fetch booking statistics.",
    });
  }
};



/* =========================================
   ADMIN DASHBOARD - LIVE BOOKINGS
========================================= */

const LIVE_BOOKING_STATUSES = [
  "SEARCHING_PROVIDER",
  "CONFIRMED",
  "IN_PROGRESS",
  "NO_PROVIDER_FOUND",
];

export const getLiveBookingsController = async (req, res) => {
  try {
    // 1. Get pagination values from query parameters.
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    // 2. Validate page.
    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        success: false,
        message: "Page must be a positive integer.",
      });
    }

    // 3. Validate limit.
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit must be between 1 and 100.",
      });
    }

    // 4. Get optional booking status.
    const { booking_status } = req.query;

    // 5. Validate booking status if provided.
    if (
      booking_status !== undefined &&
      (typeof booking_status !== "string" ||
        !LIVE_BOOKING_STATUSES.includes(booking_status))
    ) {
      return res.status(400).json({
        success: false,
        message: `Invalid booking status. Allowed statuses: ${LIVE_BOOKING_STATUSES.join(", ")}.`,
      });
    }

    // 6. Prepare validated query.
    const query = {
      page,
      limit,
      booking_status,
    };

    // 7. Call service function.
    const data = await getLiveBookings(query);

    // 8. Return successful response.
    return res.status(200).json({
      success: true,
      message: "Live bookings fetched successfully.",
      data,
    });

  } catch (error) {
    console.error("Live bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch live bookings.",
    });
  }
};

