import { NodeObject } from "jsonld";
import mockEntities from "../__mock__/.entitiesrc.json";
import { getNextEntity } from "../entities";
import { ODTAReadableStream } from "./ODTAReadableStream";
import mockPoi from "./__mocks__/fetchPoi.json";

global.fetch = jest.fn();

jest.mock("../entities", () => ({
  getNextEntity: jest.fn(),
  updateEntity: jest.fn(),
}));

describe("ODTA api reader", () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();
  });

  it("should fetch from odta api", async () => {
    (<jest.Mock>getNextEntity).mockResolvedValueOnce(mockEntities[0]);
    (<jest.Mock>getNextEntity).mockResolvedValueOnce(null);
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

    await new Promise((resolve) => stream.on("end", resolve));

    expect(result).toHaveLength(10);
    expect(result).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          meta: { lastQueryTime: 1, responseTime: 0 },
        }),
      ])
    );
    expect(result).toMatchSnapshot();
  });

  it.todo("should handle error response");
  it.todo("should handle timeout");
});
