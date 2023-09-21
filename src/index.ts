import { logger } from "./logger";
import { ODTAReadableStream } from "./streams/ODTAReadableStream";

logger.info("Starting ODTA crawler");

const odtaStream = new ODTAReadableStream();

const countByEntity: Record<string, number> = {};

odtaStream.on("data", (item) => {
  if (item && item.meta) {
    countByEntity[item.meta.entityName] =
      (countByEntity[item.meta.entityName] || 0) + 1;
  }
});

odtaStream.on("error", (err) => {
  logger.error(err);
  process.exit(1);
});

function countAll() {
  return Object.values(countByEntity).reduce((sum, count) => sum + count, 0);
}

odtaStream.on("end", () => {
  logger.info("Stream ended");
  logger.info({
    msg: `${countAll()} items fetched`,
    countByEntity,
  });
  process.exit(0);
});

process.on("SIGINT", function () {
  logger.info("Caught interrupt signal (Ctrl+C)");
  logger.info({
    msg: `${countAll()} items fetched`,
    countByEntity,
  });
  process.exit();
});
