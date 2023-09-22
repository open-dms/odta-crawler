import { dbName, level, mongoCertFile, mongoUrl } from "./config";
import { logger } from "./logger";
import { MongoDBWritableStream } from "./streams/MongoDBWriteableStream";
import { ODTAReadableStream } from "./streams/ODTAReadableStream";

logger.info({ msg: "Starting ODTA crawler", logLevel: level });

const odtaStream = new ODTAReadableStream();
const dbStream = new MongoDBWritableStream({ mongoUrl, mongoCertFile, dbName });

odtaStream.pipe(dbStream);

const countByEntity: Record<string, number> = {};

odtaStream.on("data", (item) => {
  if (item && item.meta) {
    countByEntity[item.meta.entityName] =
      (countByEntity[item.meta.entityName] || 0) + 1;
  }
});

odtaStream.on(
  "error",
  (err: Error, payload: { responseTime: number; fetchCount: number }) => {
    logger.error({ err, ...payload });
  }
);

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
