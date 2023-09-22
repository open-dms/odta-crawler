import { readFile } from "fs/promises";
import { NodeObject } from "jsonld";
import { LevelOfConcern, ODTAReadableStream } from "./ODTAReadableStream";
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
          },
        }),
      ])
    );
    expect(result).toMatchSnapshot();
  });

  it("should increase the level of concern based on errorCount", () => {
    const stream = new ODTAReadableStream();

    expect(stream.levelOfConcern).toBe(0);
    expect(stream.errorCount).toBe(0);

    for (let i = 0; i < stream.errorThreshold; i++) {
      stream.raiseConcern();
    }
    expect(stream.errorCount).toBe(0); // has been reset
    expect(stream.levelOfConcern).toBe(LevelOfConcern.Low);

    for (let i = 0; i < stream.errorThreshold * 2; i++) {
      stream.raiseConcern();
    }
    expect(stream.errorCount).toBe(0);
    expect(stream.levelOfConcern).toBe(LevelOfConcern.Medium);

    for (let i = 0; i < stream.errorThreshold * 4; i++) {
      stream.raiseConcern();
    }
    expect(stream.errorCount).toBe(0);
    expect(stream.levelOfConcern).toBe(LevelOfConcern.High);

    for (let i = 0; i < stream.errorThreshold * 4; i++) {
      stream.raiseConcern();
    }
    expect(stream.levelOfConcern).toBe(LevelOfConcern.High);
  });

  it("should decrease the level of concern", () => {
    const stream = new ODTAReadableStream();

    expect(stream.levelOfConcern).toBe(0);
    expect(stream.errorCount).toBe(0);

    for (let i = 0; i < stream.errorThreshold * 2 * 4; i++) {
      stream.raiseConcern();
    }
    expect(stream.levelOfConcern).toBe(LevelOfConcern.High);

    jest.runAllTimers();
    expect(stream.levelOfConcern).toBe(LevelOfConcern.Medium);

    stream.raiseConcern();
    jest.runAllTimers();
    expect(stream.levelOfConcern).toBe(LevelOfConcern.Low);

    stream.raiseConcern();
    jest.runAllTimers();
    expect(stream.levelOfConcern).toBe(LevelOfConcern.None);
  });
});
