import jsonld, { NodeObject } from "jsonld";
import { Readable, ReadableOptions } from "node:stream";
import { apiKey, apiUrl } from "../config";
import { getNextEntity, updateEntity } from "../entities";

export class ODTAReadableStream<T extends NodeObject> extends Readable {
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

  throttleTimeout?: NodeJS.Timeout;
  private throttleTime: number = 1000 * 5;
  private maxConcurrentRequests = 5;

  private buffer: Array<NodeObject> = [];
  private fetchCount = 0;
  private stopPushing = false;
  private shouldEnd = false;

  constructor({
    throttleTime,
    maxConcurrentRequests,
    ...options
  }: ReadableOptions & {
    throttleTime?: number;
    maxConcurrentRequests?: number;
  } = {}) {
    super({ objectMode: true, ...options });
    this.throttleTime = throttleTime || this.throttleTime;
    this.maxConcurrentRequests =
      maxConcurrentRequests || this.maxConcurrentRequests;
  }

  _read(): void {
    this.stopPushing = false;

    if (this.buffer.length > 0) {
      const continuePushing = this.push(this.buffer.shift());
      if (!continuePushing) {
        this.stopPushing = true;
        return;
      }
    } else if (this.shouldEnd) {
      this.push(null);
    }

    if (
      this.throttleTimeout ||
      this.fetchCount >= this.maxConcurrentRequests ||
      this.shouldEnd
    ) {
      return;
    }

    this.throttleTimeout = setTimeout(() => {
      delete this.throttleTimeout;
      if (this.fetchCount < this.maxConcurrentRequests) {
        this.fetch();
      }
    }, this.throttleTime);

    this.fetch();
  }

  async fetch(): Promise<void> {
    const entity = await getNextEntity();

    if (!entity) {
      // TODO should log notice and start over
      console.log("no entitiy, signaling to end stream");

      this.shouldEnd = true;
      return;
    }

    const start = Date.now();
    this.fetchCount++;

    const url = new URL(`${apiUrl}/things`);
    url.searchParams.append("filterDs", entity.ds);
    entity.sortSeed && url.searchParams.append("sortSeed", entity.sortSeed);

    const pageSize = entity.pageSize || 10;
    const page = entity.currentPage === undefined ? 0 : entity.currentPage + 1;

    console.log(
      `fetch entity=${entity.name}; page=${page}/${Math.ceil(
        (entity.total || Infinity) / pageSize
      )}`
    );

    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "page-size": String(pageSize),
        page: String(page),
      },
    });

    const responseTime = Date.now() - start;
    this.fetchCount--;

    if (!response.ok) {
      this.emit(
        "error",
        new Error(`${response.status} ${response.statusText}`)
      );
      return;
    }

    const {
      metaData,
      data,
    }: {
      metaData: ODTAMetaData;
      data: Array<T>;
    } = await response.json();

    if (!metaData) {
      this.emit(
        "error",
        new Error(`Bad Response: metaData or data not found in response text`)
      );
      return;
    }

    await updateEntity({
      ...entity,
      total: metaData.total,
      sortSeed: metaData.sortSeed,
      currentPage: metaData["current-page"],
    });

    if (metaData.total === 0) {
      return;
    }

    if (!Array.isArray(data)) {
      this.emit("error", `Data did have the wrong type (${typeof data})`);
      return;
    }

    const buffer = await Promise.all(
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

    if (!this.buffer.length && !this.stopPushing) {
      const continuePushing = this.push(buffer.shift());
      if (!continuePushing) {
        this.stopPushing = true;
      }
      this.buffer.push(...buffer);
    }
  }
}
