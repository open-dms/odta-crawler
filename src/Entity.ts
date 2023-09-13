import { readFile, writeFile } from "fs/promises";
import jsonld, { NodeObject } from "jsonld";
import path from "path";
import { RcFileNotFoundError } from "./RcFileNotFoundError";
import { apiKey, apiUrl } from "./config";
import defaultEntities from "./entities.default.json";

const rcFile = path.join(process.cwd(), ".entitiesrc.json");

type defaultInitialProps = { name: string; ds: string };

function isUntouched(entity: Entity): entity is Entity & {
  head: undefined;
  sortSeed: undefined;
  pageSize: undefined;
  total: undefined;
} {
  return !isTouched(entity);
}

function isTouched(entity: Entity): entity is Entity & {
  head: number;
  sortSeed: string;
  pageSize: number;
  total: number;
} {
  return (
    typeof entity.head === "number" &&
    typeof entity.sortSeed === "string" &&
    typeof entity.pageSize === "number" &&
    typeof entity.total === "number"
  );
}

export class Entity<T = NodeObject> {
  public name: string;
  public ds: string;
  public head?: number;
  public sortSeed?: string;
  public pageSize?: number;
  public total?: number;

  private queue: Array<number>;
  private context = {
    odms: "https://open-dms.org/",
    schema: "https://schema.org/",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    dc: "http://purl.org/dc/dcmitype/",
    sti2: "https://vocab.sti2.at/ds/",
    meta: {
      "@id": "odms:meta",
      "@type": "@id",
    },
    responseTime: "odms:responseTime",
    lastQueryTime: "odms:lastQueryTime",
  };

  constructor(initialProps: Entity & defaultInitialProps) {
    Object.assign(this, initialProps);
    this.name = initialProps.name;
    this.ds = initialProps.ds;
    this.queue = [];
  }

  async fetch(): Promise<Array<NodeObject>> {
    const url = new URL(`${apiUrl}/things`);
    url.searchParams.append("filterDs", this.ds);
    this.sortSeed && url.searchParams.append("sortSeed", this.sortSeed);

    const pageSize = this.pageSize || 10;
    const head = this.head !== undefined ? this.head : 0;
    const queueHead = this.queue.sort().slice(-1).shift();
    const page = Math.max(head, queueHead || 0) + 1;

    this.queue.push(page);
    const start = Date.now();

    console.log("[Entity] fetching", page);

    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "page-size": String(pageSize),
        page: String(page),
      },
    });

    const responseTime = Date.now() - start;

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const {
      metaData,
      data,
    }: {
      metaData: ODTAMetaData;
      data: Array<T>;
    } = await response.json();

    if (!metaData) {
      throw new Error(
        `Bad Response: metaData or data not found in response text`
      );
    }

    if (metaData.total === 0) {
      return [];
    }

    if (!Array.isArray(data)) {
      throw new Error(`Data did have the wrong type (${typeof data})`);
    }

    this.head = this.head
      ? Math.max(this.head, metaData["current-page"])
      : metaData["current-page"];
    this.queue = this.queue.filter((item) => item !== metaData["current-page"]);
    this.sortSeed = metaData.sortSeed;
    this.total = metaData.total;

    return await Promise.all(
      data.map(async (item) =>
        (({ "@context": _, ...compacted }) => compacted)(
          await jsonld.compact(
            {
              ...item,
              [`${this.context.odms}meta`]: {
                [`${this.context.odms}lastQueryTime`]: Date.now(),
                [`${this.context.odms}responseTime`]: responseTime,
              },
            },
            this.context
          )
        )
      )
    );
  }

  toString() {
    return `name='${this.name}'; head=${this.head}; queue=${JSON.stringify(
      this.queue
    )}`;
  }

  static async loadEntities(): Promise<Array<Entity>> {
    try {
      const json = await readFile(rcFile, "utf-8");
      if (!json) {
        throw new RcFileNotFoundError("rc file not found, creating one...");
      }
      const data = JSON.parse(json) as Array<Entity>;
      return data.map((entity) => new Entity(entity as Entity));
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return (defaultEntities as Array<Entity>).map(
          (entity) => new Entity(entity)
        );
      }
      throw err;
    }
  }

  static saveEntities(entities: Array<Entity>): Promise<void> {
    return writeFile(rcFile, JSON.stringify(entities));
  }

  static getNextEntity(entities: Array<Entity>): Entity | null {
    const untouched = entities.find(isUntouched);
    if (untouched) {
      return untouched;
    }

    let minRatio = Infinity;
    let selectedEntity: Entity | null = null;

    for (const entity of entities.filter(isTouched)) {
      const head = entity.queue.sort().slice(-1).shift() || entity.head;
      const nextPage = head + 1;
      const totalPages = Math.ceil(entity.total / entity.pageSize);

      if (totalPages === 0 || nextPage >= totalPages) {
        continue;
      }

      const ratio = head / totalPages;

      if (ratio < minRatio) {
        minRatio = ratio;
        selectedEntity = entity;
      }
    }

    return selectedEntity;
  }
}
