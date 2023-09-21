import { NodeObject } from "jsonld";
import { Readable, ReadableOptions } from "node:stream";
import { Entity } from "../Entity";
import { logger } from "../logger";

export class ODTAReadableStream extends Readable {
  throttleTimeout?: NodeJS.Timeout;
  private throttleTime: number = 1000 * 5;
  private maxConcurrentRequests = 5;

  private buffer: Array<NodeObject> = [];
  private fetchCount = 0;
  private stopPushing = false;
  private shouldEnd = false;

  private entities: Array<Entity> | null = null;

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

  async _read(): Promise<void> {
    this.stopPushing = false;

    if (this.buffer.length > 0) {
      const continuePushing = this.push(this.buffer.shift());
      if (!continuePushing) {
        this.stopPushing = true;
        return;
      }
    } else if (this.shouldEnd) {
      logger.debug({
        msg: "ending stream, pushing null",
        shouldEnd: this.shouldEnd,
      });
      this.push(null);
    }

    this.requestNextFetch();
  }

  async requestNextFetch() {
    if (
      this.throttleTimeout ||
      this.fetchCount >= this.maxConcurrentRequests ||
      this.shouldEnd
    ) {
      return;
    }

    logger.debug("requesting next fetch");

    this.throttleTimeout = setTimeout(async () => {
      logger.debug("saving entites");

      this.entities && Entity.saveEntities(this.entities);
      delete this.throttleTimeout;

      if (this.fetchCount < this.maxConcurrentRequests) {
        this.requestNextFetch();
      }
    }, this.throttleTime);

    const result = await this.fetch();

    if (result.length === 0) {
      this.requestNextFetch();
    } else {
      this.handleResult(result);
    }
  }

  async fetch(): Promise<Array<NodeObject>> {
    if (!this.entities) {
      this.entities = await Entity.loadEntities();
    }

    const entity = Entity.getNextEntity(this.entities);

    if (!entity) {
      // TODO should log notice and start over
      logger.debug("no entitiy, signaling to end stream");

      this.shouldEnd = true;
      return [];
    }

    this.fetchCount++;
    logger.debug({ msg: "fetching", entity, fetchCount: this.fetchCount });

    let buffer: Array<NodeObject> = [];
    try {
      buffer = await entity.fetch();
    } catch (err) {
      this.emit("error", err);
    }

    this.fetchCount--;

    logger.debug({ msg: "done fetching", entity });

    return buffer;
  }

  handleResult(result: Array<NodeObject>): void {
    if (result.length && !this.buffer.length && !this.stopPushing) {
      const continuePushing = this.push(result.shift());
      if (!continuePushing) {
        this.stopPushing = true;
      }
    }
    this.buffer.push(...result);
  }
}
