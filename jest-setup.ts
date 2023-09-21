process.env.LOG_LEVEL = "silent";

jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

global.fetch = jest.fn();
