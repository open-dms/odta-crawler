import { dbName, level, mongoCertFile, mongoUrl } from "./config";
import { logger } from "./logger";
import { MongoDBWritableStream } from "./streams/MongoDBWriteableStream";
import { ODTAReadableStream } from "./streams/ODTAReadableStream";

logger.info({ msg: "Starting ODTA crawler", logLevel: level });

const odtaStream = new ODTAReadableStream();
const dbStream = new MongoDBWritableStream({ mongoUrl, mongoCertFile, dbName });

dbStream.on("connect", () => {
  logger.info("Downstream connection established, piping data...");
  odtaStream.pipe(dbStream);
});

odtaStream.on(
  "error",
  (err: Error, payload: { responseTime: number; fetchCount: number }) => {
    logger.error({ err, ...payload });
  }
);

odtaStream.on("end", () => {
  logger.info("Stream ended");
  process.exit(0);
});

process.on("SIGINT", function () {
  logger.info("Caught interrupt signal (Ctrl+C)");
  process.exit();
});
