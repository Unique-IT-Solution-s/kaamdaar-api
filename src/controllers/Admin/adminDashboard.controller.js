import { getAdminDashboardSummary } from "../../services/admin/dashboard.service.js";

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
