import "dotenv/config";

const { API_URL, API_KEY, LOG_LEVEL, MONGO_URL, MONGO_CERT_FILE, DB_NAME } =
  process.env;

export const apiUrl = API_URL || "";
export const apiKey = API_KEY || "";
export const level = LOG_LEVEL || "info";
export const mongoUrl = MONGO_URL || "";
export const mongoCertFile = MONGO_CERT_FILE || "";
export const dbName = DB_NAME || "";
