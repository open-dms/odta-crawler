import { ODTAReadableStream } from "./streams/ODTAReadableStream";

const odtaStream = new ODTAReadableStream();

const result = [];
odtaStream.on("data", (item) => {
  result.push(item);
});

odtaStream.on("error", (err) => {
  console.error("Error from stream:", err);
  process.exit(1);
});

odtaStream.on("end", () => {
  console.log("Stream ended");
  console.log(`${result.length} items fetched`);
  process.exit(0);
});

process.on("SIGINT", function () {
  console.log("Caught interrupt signal (Ctrl+C)");

  console.log(`${result.length} items fetched`);

  process.exit();
});
