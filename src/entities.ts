import { access, readFile, writeFile } from "fs/promises";
import path from "path";
import { RcFileNotFoundError } from "./RcFileNotFoundError";
import defaultEntities from "./entities.default.json";

const rcFile = path.join(process.cwd(), ".entitiesrc.json");

export async function getAllEntities(): Promise<Array<Entity>> {
  try {
    await access(rcFile);
    const data = await readFile(rcFile, "utf-8");
    if (!data) {
      throw new RcFileNotFoundError("rc file not found, creating one...");
    }
    return JSON.parse(data);
  } catch (e) {
    if (e instanceof RcFileNotFoundError) {
      return defaultEntities as Array<Entity>;
    }
    throw e;
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

function isUntouched(
  entity: Entity
): entity is Entity & { currentPage: undefined; total: undefined } {
  return (
    typeof entity.total === "undefined" ||
    typeof entity.currentPage === "undefined"
  );
}

function isTouched(
  entity: Entity
): entity is Entity & { currentPage: number; total: number } {
  return (
    typeof entity.total === "number" || typeof entity.currentPage === "number"
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
    if (entity.currentPage >= (entity.total || Infinity)) {
      continue;
    }
    const ratio = entity.currentPage / (entity.total || 1);
    if (ratio < minRatio) {
      minRatio = ratio;
      selectedEntity = entity;
    }
  }

  return selectedEntity;
}
