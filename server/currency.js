// Published USD/INR reference retrieved on 2026-10-27; catalog conversion is a one-time reprice.
export const INR_RATE = 95.18;
export const INR_RATE_DATE = "2026-10-26";
export const INR_RATE_SOURCE = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR";
export const toRupees = (amount, rate = INR_RATE) => Math.round((Number(amount) * rate + Number.EPSILON) * 100) / 100;
