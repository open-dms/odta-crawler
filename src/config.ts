import "dotenv/config";

const { API_URL, API_KEY, LOG_LEVEL } = process.env;

export const apiUrl = API_URL || "";
export const apiKey = API_KEY || "";
export const level = LOG_LEVEL || "info";
