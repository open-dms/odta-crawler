import { readFile, writeFile } from "fs/promises";
import path from "path";
import { RcFileNotFoundError } from "./RcFileNotFoundError";
import defaultEntities from "./entities.default.json";

const rcFile = path.join(process.cwd(), ".entitiesrc.json");

export async function getAllEntities(): Promise<Array<Entity>> {
  try {
    const data = await readFile(rcFile, "utf-8");
    if (!data) {
      throw new RcFileNotFoundError("rc file not found, creating one...");
    }
    return JSON.parse(data);
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return defaultEntities as Array<Entity>;
    }
    throw err;
  }
}

export async function updateEntity(
  entity: Partial<Entity> & { name: string }
): Promise<void> {
  const entities = (await getAllEntities()).map((item) =>
    item.name === entity.name ? { ...item, ...entity } : item
  );
  return writeFile(rcFile, JSON.stringify(entities));
}

function isUntouched(entity: Entity): entity is Entity & {
  currentPage: undefined;
  sortSeed: undefined;
  pageSize: undefined;
  total: undefined;
} {
  return !isTouched(entity);
}

function isTouched(entity: Entity): entity is Entity & {
  currentPage: number;
  sortSeed: string;
  pageSize: number;
  total: number;
} {
  return (
    typeof entity.currentPage === "number" &&
    typeof entity.sortSeed === "string" &&
    typeof entity.pageSize === "number" &&
    typeof entity.total === "number"
  );
}

export async function getNextEntity(): Promise<Entity | null> {
  const entities = await getAllEntities();
  const untouched = entities.find(isUntouched);
  if (untouched) {
    return untouched;
  }

  let minRatio = Infinity;
  let selectedEntity: Entity | null = null;

  for (const entity of entities.filter(isTouched)) {
    if (entity.total === 0) {
      continue;
    }
    if (entity.currentPage >= entity.total * entity.pageSize) {
      continue;
    }
    const ratio = (entity.currentPage * entity.pageSize) / (entity.total || 1);
    if (ratio < minRatio) {
      minRatio = ratio;
      selectedEntity = entity;
    }
  }

  return selectedEntity;
}
