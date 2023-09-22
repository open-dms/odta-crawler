import { Db, MongoClient, ServerApiVersion } from "mongodb";
import { Writable, WritableOptions } from "node:stream";
import { ODTAItem } from "./typings";

export class MongoDBWritableStream extends Writable {
  private dbName: string;
  private client: MongoClient;
  private db?: Db;

  constructor(
    options: WritableOptions & {
      mongoUrl: string;
      mongoCertFile: string;
      dbName: string;
    }
  ) {
    super({ objectMode: true });
    this.dbName = options.dbName;
    const { mongoUrl, mongoCertFile } = options;
    this.client = new MongoClient(mongoUrl, {
      tls: true,
      tlsCertificateKeyFile: mongoCertFile,
      serverApi: ServerApiVersion.v1,
    });
  }

  async _write(
    item: ODTAItem,
    _: never,
    callback: (error?: Error | null | undefined) => void
  ): Promise<void> {
    try {
      if (!this.db) {
        await this.client.connect();
        this.db = this.client.db(this.dbName);
      }

      const collection = this.db.collection(item.meta.entityName);
      const upsertFilter = { "@id": item["@id"] };

      await collection.updateOne(
        upsertFilter,
        { $set: item },
        { upsert: true }
      );

      callback();
    } catch (err) {
      callback(this.buildError(err, { meta: item.meta }));
    }
  }

  async _final(callback: (error?: Error | null) => void): Promise<void> {
    try {
      await this.client.close();
      callback();
    } catch (err) {
      callback(this.buildError(err));
    }
  }

  _destroy(error: Error | null, callback: (error: Error | null) => void): void {
    if (this.client) {
      this.client.close().then(() => callback(error));
    } else {
      callback(error);
    }
  }

  buildError(err: unknown, payload?: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Error(message, { cause: { err, ...(payload || {}) } });
  }
}
