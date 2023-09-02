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

  constructor(options: ReadableOptions = {}) {
    super({ objectMode: true, ...options });
  }

  async _read(): Promise<void> {
    const entity = await getNextEntity();

    if (!entity) {
      // TODO should log notice and start over
      this.push(null);
      return;
    }

    const start = Date.now();

    const url = new URL(apiUrl);
    url.searchParams.append("filterDs", entity.ds);
    entity.sortSeed && url.searchParams.append("sortSeed", entity.sortSeed);

    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "page-size": String(entity.pageSize || 10),
        page: String(entity.currentPage || 0),
      },
    });

    const responseTime = Date.now() - start;

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
      data: T[];
    } = await response.json();

    if (!metaData || !data) {
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

    if (!Array.isArray(data)) {
      this.emit("error", `Data did have the wrong type (${typeof data})`);
      return;
    }

    for (const item of data) {
      const compacted = await jsonld.compact(
        {
          ...item,
          [`${this.context.odms}meta`]: {
            [`${this.context.odms}lastQueryTime`]: Date.now(),
            [`${this.context.odms}responseTime`]: responseTime,
          },
        },
        this.context
      );
      delete compacted["@context"];
      this.push(compacted);
    }
  }
}
