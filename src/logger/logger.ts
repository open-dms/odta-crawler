import pino from "pino";
import { level } from "../config";
import { errorSerializer } from "./errorSerializer";

export const logger = pino({
  level,
  serializers: {
    err: errorSerializer,
  },
});
