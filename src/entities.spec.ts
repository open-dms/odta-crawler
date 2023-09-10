import { readFile, writeFile } from "fs/promises";
import { getAllEntities, getNextEntity, updateEntity } from "./entities";
import mockEntitiesRc from "./__mock__/.entitiesrc.json";

class MockFileError extends Error {
  code = "ENOENT";
}

describe("Entities", () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  it("should get default entities", async () => {
    (<jest.Mock>readFile).mockRejectedValue(new MockFileError());
    expect(await getAllEntities()).toBeInstanceOf(Array);
    expect(await getAllEntities()).toHaveLength(11);
    expect(await getAllEntities()).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          ds: expect.any(String),
        }),
        expect.not.objectContaining({
          total: expect.anything(),
        }),
      ])
    );
  });

  it("should get entities from rc file", async () => {
    (<jest.Mock>readFile).mockResolvedValue(JSON.stringify(mockEntitiesRc));
    const entities = await getAllEntities();
    expect(entities[0]).toMatchObject({
      name: expect.any(String),
      ds: expect.any(String),
      pageSize: 10,
      currentPage: 0,
      total: expect.any(Number),
    });
  });

  it("picks the next untouched entity", async () => {
    const mockEntities: Array<Partial<Entity>> = [
      {
        currentPage: 1,
        sortSeed: "random",
        pageSize: 10,
        total: 30,
      },
      { name: "mock-untouched" },
    ];
    (<jest.Mock>readFile).mockResolvedValue(JSON.stringify(mockEntities));
    expect(await getNextEntity()).toMatchObject(mockEntities[1]);
  });

  it("picks the next entity with lowest total to current ratio", async () => {
    const mockEntities: Array<Entity> = [
      { currentPage: 10, total: 30, name: "", ds: "" },
      { currentPage: 10, total: 20, name: "", ds: "" },
      { currentPage: 10, total: 10, name: "", ds: "" },
    ];
    (<jest.Mock>readFile).mockResolvedValue(JSON.stringify(mockEntities));
    expect(await getNextEntity()).toMatchObject(mockEntities[0]);
  });

  it("should update an entity", async () => {
    const mockEntities: Array<Entity> = [
      {
        currentPage: 10,
        total: 20,
        name: "entity-1",
        ds: "https://schema-1",
      },
      {
        currentPage: 10,
        total: 30,
        name: "entity-2",
        ds: "https://schema-2",
      },
    ];
    (<jest.Mock>readFile).mockResolvedValueOnce(JSON.stringify(mockEntities));
    await updateEntity({
      name: "entity-2",
      currentPage: 11,
    });
    expect(<jest.Mock>writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.entitiesrc.json$/),
      JSON.stringify([
        {
          currentPage: 10,
          total: 20,
          name: "entity-1",
          ds: "https://schema-1",
        },
        {
          currentPage: 11,
          total: 30,
          name: "entity-2",
          ds: "https://schema-2",
        },
      ])
    );
  });
});
