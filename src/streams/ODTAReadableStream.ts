import { NodeObject } from "jsonld";
import { Readable, ReadableOptions } from "node:stream";
import { Entity } from "../Entity";

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
      this.entities && Entity.saveEntities(this.entities);
      delete this.throttleTimeout;
      if (this.fetchCount < this.maxConcurrentRequests) {
        this.fetch();
      }
    }, this.throttleTime);

    this.fetch();
  }

  async fetch(): Promise<void> {
    if (!this.entities) {
      this.entities = await Entity.loadEntities();
    }

    const entity = Entity.getNextEntity(this.entities);

    if (!entity) {
      // TODO should log notice and start over
      console.log("no entitiy, signaling to end stream");

      this.shouldEnd = true;
      return;
    }

    console.log("fetching", String(entity));

    this.fetchCount++;

    const buffer = await entity.fetch();

    this.fetchCount--;

    console.log("done fetching", String(entity));

    if (!this.buffer.length && !this.stopPushing) {
      const continuePushing = this.push(buffer.shift());
      if (!continuePushing) {
        this.stopPushing = true;
      }
    }
    this.buffer.push(...buffer);
  }
}
