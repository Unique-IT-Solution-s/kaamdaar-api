
import CustomerProfile from "../../models/CustomerProfile.js";
import ProviderProfile from "../../models/ProviderProfile.js";
import Booking from "../../models/Booking.js";
import Payment from "../../models/Payment.js";

/* =========================================
   1. DATE RANGE HELPER
========================================= */

const TIMEZONE_OFFSET = "+05:30";

const getIndiaDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const parseIndiaDate = (dateString, endOfDay = false) => {
  const time = endOfDay
    ? "23:59:59.999"
    : "00:00:00.000";

  return new Date(
    `${dateString}T${time}${TIMEZONE_OFFSET}`
  );
};

const getDateRange = (from, to) => {
  let startDate;
  let endDate;

  if (from || to) {
    if (!from || !to) {
      throw new Error("Both from and to dates are required.");
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      throw new Error("Dates must use YYYY-MM-DD format.");
    }

    startDate = parseIndiaDate(from);
    endDate = parseIndiaDate(to, true);

    // Reject invalid calendar dates.
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      getIndiaDateString(startDate) !== from ||
      getIndiaDateString(endDate) !== to
    ) {
      throw new Error("Invalid date range.");
    }
  } else {
    const today = getIndiaDateString();

    endDate = parseIndiaDate(today, true);

    startDate = new Date(
      parseIndiaDate(today).getTime() -
        29 * 24 * 60 * 60 * 1000
    );
  }

  if (startDate > endDate) {
    throw new Error("The from date cannot be after the to date.");
  }

  const duration =
    endDate.getTime() - startDate.getTime() + 1;

  const previousEndDate = new Date(
    startDate.getTime() - 1
  );

  const previousStartDate = new Date(
    previousEndDate.getTime() - duration + 1
  );

  return {
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
  };
};


/* =========================================
   2. GROWTH CALCULATION
========================================= */

const calculateGrowth = (current, previous) => {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return Number(
    (((current - previous) / previous) * 100).toFixed(2)
  );
};


/* =========================================
   3. PAYMENT REVENUE AGGREGATION
========================================= */

const getRevenueStats = async (startDate, endDate) => {
  const result = await Payment.aggregate([
    {
      $match: {
        payment_status: {
          $in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"],
        },

        paid_at: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },

    // Get the original booking pricing snapshot.
    {
      $lookup: {
        from: "bookings",
        localField: "booking_id",
        foreignField: "_id",
        as: "booking",
      },
    },

    {
      $unwind: {
        path: "$booking",
        preserveNullAndEmptyArrays: true,
      },
    },

    // Calculate net collected amount.
    {
      $addFields: {
        net_amount: {
          $subtract: [
            "$amount",
            { $ifNull: ["$refund_amount", 0] },
          ],
        },
      },
    },

    // Calculate commission proportionally after refunds.
    {
      $addFields: {
        net_commission: {
          $cond: [
            {
              $and: [
                { $gt: ["$booking.pricing.total_amount", 0] },
                { $gt: ["$booking.pricing.commission_amount", 0] },
              ],
            },
            {
              $round: [
                {
                  $multiply: [
                    "$booking.pricing.commission_amount",
                    {
                      $divide: [
                        "$net_amount",
                        "$booking.pricing.total_amount",
                      ],
                    },
                  ],
                },
                0,
              ],
            },
            0,
          ],
        },
      },
    },

    {
      $group: {
        _id: null,

        gross_amount: {
          $sum: "$amount",
        },

        refund_amount: {
          $sum: { $ifNull: ["$refund_amount", 0] },
        },

        net_amount: {
          $sum: "$net_amount",
        },

        platform_commission: {
          $sum: "$net_commission",
        },

        total_payments: {
          $sum: 1,
        },
      },
    },
  ]);

  const stats = result[0] || {};

  return {
    gross_amount: stats.gross_amount || 0,
    refund_amount: stats.refund_amount || 0,
    net_amount: stats.net_amount || 0,
    platform_commission: stats.platform_commission || 0,
    total_payments: stats.total_payments || 0,
  };
};


/* =========================================
   4. ADMIN DASHBOARD SUMMARY
========================================= */

export const getAdminDashboardSummary = async (query) => {
  const {
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
  } = getDateRange(query.from, query.to);

  const currentPeriod = {
    $gte: startDate,
    $lte: endDate,
  };

  const previousPeriod = {
    $gte: previousStartDate,
    $lte: previousEndDate,
  };

  // -------------------------------------
  // A. CUSTOMER COUNTS
  // -------------------------------------

  const [
    totalCustomers,
    newCustomers,
    previousNewCustomers,
  ] = await Promise.all([
    CustomerProfile.countDocuments(),

    CustomerProfile.countDocuments({
      created_at: currentPeriod,
    }),

    CustomerProfile.countDocuments({
      created_at: previousPeriod,
    }),
  ]);

  // -------------------------------------
  // B. PROVIDER COUNTS
  // -------------------------------------

  const [
    totalProviders,
    newProviders,
    previousNewProviders,
  ] = await Promise.all([
    ProviderProfile.countDocuments(),

    ProviderProfile.countDocuments({
      createdAt: currentPeriod,
    }),

    ProviderProfile.countDocuments({
      createdAt: previousPeriod,
    }),
  ]);

  // -------------------------------------
  // C. BOOKING COUNTS
  // -------------------------------------

  const [
    totalBookings,
    previousTotalBookings,
    completedBookings,
    cancelledBookings,
  ] = await Promise.all([
    Booking.countDocuments({
      created_at: currentPeriod,
    }),

    Booking.countDocuments({
      created_at: previousPeriod,
    }),

    Booking.countDocuments({
      created_at: currentPeriod,
      booking_status: "COMPLETED",
    }),

    Booking.countDocuments({
      created_at: currentPeriod,
      booking_status: "CANCELLED",
    }),
  ]);

  // -------------------------------------
  // D. REVENUE COUNTS
  // -------------------------------------

  const [
    revenue,
    previousRevenue,
  ] = await Promise.all([
    getRevenueStats(startDate, endDate),
    getRevenueStats(previousStartDate, previousEndDate),
  ]);

  // -------------------------------------
  // E. COMPLETION AND CANCELLATION RATES
  // -------------------------------------

  const completionRate =
    totalBookings > 0
      ? Number(
          ((completedBookings / totalBookings) * 100).toFixed(2)
        )
      : 0;

  const cancellationRate =
    totalBookings > 0
      ? Number(
          ((cancelledBookings / totalBookings) * 100).toFixed(2)
        )
      : 0;

  // -------------------------------------
  // F. FINAL RESPONSE DATA
  // -------------------------------------

  return {
    period: {
      from: getIndiaDateString(startDate),
      to: getIndiaDateString(endDate),
      timezone: "Asia/Kolkata",
    },

    customers: {
      total: totalCustomers,
      new_in_period: newCustomers,
      previous_period: previousNewCustomers,
      growth_percentage: calculateGrowth(
        newCustomers,
        previousNewCustomers
      ),
    },

    providers: {
      total: totalProviders,
      new_in_period: newProviders,
      previous_period: previousNewProviders,
      growth_percentage: calculateGrowth(
        newProviders,
        previousNewProviders
      ),
    },

    bookings: {
      total: totalBookings,
      previous_period: previousTotalBookings,
      growth_percentage: calculateGrowth(
        totalBookings,
        previousTotalBookings
      ),
      completed: completedBookings,
      cancelled: cancelledBookings,
      completion_rate: completionRate,
      cancellation_rate: cancellationRate,
    },

    revenue: {
      gross_amount: revenue.gross_amount,
      refund_amount: revenue.refund_amount,
      net_amount: revenue.net_amount,
      platform_commission: revenue.platform_commission,
      total_payments: revenue.total_payments,
      currency: "INR",
    },

    revenue_comparison: {
      previous_net_amount: previousRevenue.net_amount,
      growth_percentage: calculateGrowth(
        revenue.net_amount,
        previousRevenue.net_amount
      ),
    },
  };
};
