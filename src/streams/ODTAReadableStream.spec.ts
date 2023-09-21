import { readFile } from "fs/promises";
import { NodeObject } from "jsonld";
import { ODTAReadableStream } from "./ODTAReadableStream";
import mockPoi from "./__mocks__/fetchPoi.json";

jest.useFakeTimers();

describe("ODTAReadableStream", () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();
  });

  it("should fetch", async () => {
    (<jest.Mock>readFile).mockResolvedValue(
      JSON.stringify([
        {
          name: "mock-entity-1",
          ds: "https://semantify.it/ds/mhpmBCJJt",
          head: 0,
          pageSize: 10,
          sortSeed: "random",
          total: 20,
        },
      ])
    );
    (<jest.Mock>fetch).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockPoi),
    });

    jest.setSystemTime(1);

    const stream = new ODTAReadableStream();
    const result: NodeObject[] = [];

    stream.on("data", (item: NodeObject) => {
      result.push(item);
    });

    stream.once("data", () => {
      jest.runAllTimers();
    });

    await new Promise((resolve) => stream.on("end", resolve));
    expect(result).toHaveLength(10);
    expect(result).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          meta: {
            entityName: "mock-entity-1",
            lastQueryTime: 1,
            responseTime: 0,
          },
        }),
      ])
    );
    expect(result).toMatchSnapshot();
  });

  it.todo("should handle error response");
  it.todo("should handle timeout");
});
