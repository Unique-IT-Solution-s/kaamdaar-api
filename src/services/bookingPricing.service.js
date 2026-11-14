export const calculateBookingPricing = (
  servicePrice,
  commissionPercentage
) => {
  const commissionAmount = Math.round(
    servicePrice * commissionPercentage / 100
  );

  const providerEarning = servicePrice - commissionAmount;

  return {
    service_price: servicePrice,
    currency: "INR",
    commission_percentage: commissionPercentage,
    commission_amount: commissionAmount,
    provider_earning: providerEarning,
    total_amount: servicePrice,
  };
};