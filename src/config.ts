import "dotenv/config";

const { API_URL, API_KEY } = process.env;

export const apiUrl = API_URL || "";
export const apiKey = API_KEY || "";
