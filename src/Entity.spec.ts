import { readFile } from "fs/promises";
import { Entity } from "./Entity";
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
    expect(await Entity.loadEntities()).toBeInstanceOf(Array);
    expect(await Entity.loadEntities()).toHaveLength(11);
    expect(await Entity.loadEntities()).toMatchObject(
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
    const entities = await Entity.loadEntities();
    expect(entities[0]).toMatchObject({
      name: expect.any(String),
      ds: expect.any(String),
      pageSize: 10,
      head: 0,
      total: expect.any(Number),
    });
  });

  it("picks the next untouched entity", async () => {
    const mockEntities: Array<Partial<Entity>> = [
      {
        head: 1,
        sortSeed: "random",
        pageSize: 10,
        total: 30,
      },
      { name: "mock-untouched" },
    ];
    (<jest.Mock>readFile).mockResolvedValue(JSON.stringify(mockEntities));
    const entities = await Entity.loadEntities();
    expect(Entity.getNextEntity(entities)).toMatchObject(mockEntities[1]);
  });

  it("picks the next entity with lowest total to current ratio", async () => {
    const mockEntities: Array<Partial<Entity>> = [
      { head: 1, name: "mock-1", pageSize: 10, sortSeed: "random", total: 30 },
      { head: 1, name: "mock-2", pageSize: 10, sortSeed: "random", total: 20 },
      { head: 1, name: "mock-3", pageSize: 10, sortSeed: "random", total: 10 },
    ];
    (<jest.Mock>readFile).mockResolvedValue(JSON.stringify(mockEntities));
    const entities = await Entity.loadEntities();
    expect(Entity.getNextEntity(entities)).toMatchObject(mockEntities[0]);
  });

  it("should stop getting entities at the end", async () => {
    const mockEntities: Array<Partial<Entity>> = [
      {
        name: "mock-entity-1",
        head: 2,
        sortSeed: "random",
        pageSize: 10,
        total: 30,
      },
      {
        name: "mock-entity-no-data",
      },
    ];
    (<jest.Mock>readFile).mockResolvedValue(JSON.stringify(mockEntities));
    const entities = await Entity.loadEntities();
    expect(Entity.getNextEntity(entities)).toMatchObject(mockEntities[1]);
    entities[1].head = 0;
    entities[1].total = 0;
    expect(Entity.getNextEntity(entities)).toBeNull();
  });
});
