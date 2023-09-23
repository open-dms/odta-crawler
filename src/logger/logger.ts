import pino from "pino";
import { axiomDataset, axiomToken, level } from "../config";
import { errorSerializer } from "./errorSerializer";

const transport =
  axiomDataset && axiomToken
    ? pino.transport({
        target: "@axiomhq/pino",
        options: {
          dataset: axiomDataset,
          token: axiomToken,
        },
      })
    : undefined;

export const logger = pino(
  {
    level,
    serializers: {
      err: errorSerializer,
    },
  },
  transport
);
