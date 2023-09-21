import pino from "pino";
import { errorSerializer } from "./errorSerializer";

describe("errorSerializer", () => {
  it("should serialze an error object with properly hoisting the cause payload", () => {
    expect(
      errorSerializer(new Error("Hallo Welt", { cause: { pay: "load" } }))
    ).toMatchObject({
      cause: { pay: "load" },
      message: "Hallo Welt",
      type: "Error",
    });
  });

  it("should enable pino to show the payload", () => {
    const mockTransport = { write: jest.fn() };
    pino(
      {
        serializers: {
          err: errorSerializer,
        },
      },
      mockTransport
    ).info(new Error("Hallo Welt", { cause: { pay: "load" } }));
    expect(mockTransport.write).toHaveBeenCalled();
    expect(mockTransport.write.mock.lastCall).toMatchObject(
      expect.arrayContaining([
        expect.stringContaining('"cause":{"pay":"load"}}'),
      ])
    );
  });
});
