jest.mock("fs/promises", () => ({
  access: jest.fn().mockResolvedValue(false),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

global.fetch = jest.fn();
