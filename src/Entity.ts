import { readFile, writeFile } from "fs/promises";
import jsonld, { NodeObject } from "jsonld";
import path from "path";
import { Logger } from "pino";
import { EntityEndError } from "./EntityEndError";
import { RcFileNotFoundError } from "./RcFileNotFoundError";
import { apiKey, apiUrl, defaultPageSize } from "./config";
import defaultEntities from "./entities.default.json";
import { logger } from "./logger";
import { ODTAMetaData } from "./streams/typings";

const rcFile = path.join(process.cwd(), ".entitiesrc.json");

type defaultInitialProps = { name: string; ds: string };

export class Entity {
  public name: string;
  public ds: string;
  public head?: number;
  public sortSeed?: string;
  public pageSize?: number;
  public total?: number;

  private queue: Set<number>;
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
    entityName: "odms:entityName",
    lastQueryTime: "odms:lastQueryTime",
  };
  private isFetching = false;
  logger: Logger;

  constructor(initialProps: Entity & defaultInitialProps) {
    Object.assign(this, initialProps);
    this.name = initialProps.name;
    this.logger = logger.child({
      module: this.constructor.name,
      entity: this.name,
    });
    this.ds = initialProps.ds;
    this.queue = new Set();
  }

  get untouched() {
    return (
      typeof this.head !== "number" &&
      typeof this.pageSize !== "number" &&
      typeof this.sortSeed !== "string" &&
      typeof this.total !== "number" &&
      this.isFetching === false
    );
  }

  get totalPages() {
    return Math.ceil((this.total || 0) / (this.pageSize || defaultPageSize));
  }

  async fetch(): Promise<Array<NodeObject>> {
    this.isFetching = true;

    const url = new URL(`${apiUrl}/things`);
    url.searchParams.append("filterDs", this.ds);
    this.sortSeed && url.searchParams.append("sortSeed", this.sortSeed);

    const pageSize = this.pageSize || defaultPageSize;
    const queueHead = [...this.queue].sort().slice(-1).shift();
    const page = Math.max(
      this.head === undefined ? 0 : this.head + 1,
      queueHead === undefined ? 0 : queueHead + 1
    );

    if (page >= this.totalPages) {
      throw new EntityEndError(this);
    }

    this.queue.add(page);

    this.logger.debug({ msg: "fetching", page });

    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "page-size": String(pageSize),
        page: String(page),
      },
    });

    if (!response.ok) {
      throw new Error(`http ${response.status} ${response.statusText}`, {
        cause: {
          status: response.status,
          statusText: response.statusText,
          body: response.body,
          url,
          entity: this,
          page,
        },
      });
    }

    const {
      metaData,
      data,
    }: {
      metaData: ODTAMetaData;
      data: Array<NodeObject>;
    } = await response.json();

    if (!metaData) {
      throw new Error(
        "Bad Response: metaData or data not found in response text",
        {
          cause: {
            entity: this,
            url,
          },
        }
      );
    }

    if (metaData.total === 0) {
      return [];
    }

    if (!Array.isArray(data)) {
      throw new Error(`Data did have the wrong type (${typeof data})`, {
        cause: {
          entity: this,
          url,
        },
      });
    }

    this.head =
      this.head === undefined
        ? metaData["current-page"]
        : Math.max(this.head, metaData["current-page"]);
    this.queue.delete(metaData["current-page"]);
    this.pageSize = metaData["page-size"];
    this.sortSeed = metaData.sortSeed;
    this.total = metaData.total;

    this.isFetching = false;

    return await Promise.all(
      data.map(async (item) =>
        (({ "@context": _, ...compacted }) => compacted)(
          await jsonld.compact(
            {
              ...item,
              [`${this.context.odms}meta`]: {
                [`${this.context.odms}entityName`]: this.name,
                [`${this.context.odms}lastQueryTime`]: Date.now(),
              },
            },
            this.context
          )
        )
      )
    );
  }

  toJSON() {
    const { name, head, queue, total, totalPages } = this;
    return {
      name,
      head,
      total,
      totalPages,
      queue,
    };
  }

  toString() {
    return Object.entries(this.toJSON())
      .map(([key, value]) => [key, JSON.stringify(value)].join("="))
      .join("; ");
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
    return writeFile(
      rcFile,
      JSON.stringify(
        entities.map(({ name, ds, head, sortSeed, pageSize, total }) => ({
          name,
          ds,
          head,
          sortSeed,
          pageSize,
          total,
        }))
      )
    );
  }

  static getNextEntity(entities: Array<Entity>): Entity | null {
    const untouched = entities.find(({ untouched }) => untouched);
    if (untouched) {
      return untouched;
    }

    let minRatio = Infinity;
    let selectedEntity: Entity | null = null;

    for (const entity of entities.filter(({ untouched }) => !untouched)) {
      const head =
        [...entity.queue].sort().slice(-1).shift() || entity.head || 0;
      const nextPage = head + 1;

      if (entity.totalPages === 0 || nextPage >= entity.totalPages) {
        continue;
      }

      const ratio = head / entity.totalPages;

      if (ratio < minRatio) {
        minRatio = ratio;
        selectedEntity = entity;
      }
    }

    return selectedEntity;
  }
}
