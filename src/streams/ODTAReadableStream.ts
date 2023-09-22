import { NodeObject } from "jsonld";
import { Readable, ReadableOptions } from "node:stream";
import { Entity } from "../Entity";
import { logger } from "../logger";

export enum LevelOfConcern {
  None = 0,
  Low = 1,
  Medium = 2,
  High = 3,
}

export class ODTAReadableStream extends Readable {
  levelOfConcern = LevelOfConcern.None;
  errorCount = 0;
  errorThreshold = 3;

  private throttleTimeout?: NodeJS.Timeout;
  private levelOfConcernTimeout?: NodeJS.Timeout;
  private _throttleTime: number = 1000 * 5;
  private _maxConcurrentRequests = 5;
  private buffer: Array<NodeObject> = [];
  private fetchCount = 0;
  private stopPushing = false;
  private shouldEnd = false;
  private levelOfConcernBase = 4;
  private levelOfConcernThrottleBase = 2;
  private levelOfConcernErrorBase = 2;
  private errorCooldown = 1000 * 10;
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
    this._throttleTime = throttleTime || this._throttleTime;
    this._maxConcurrentRequests =
      maxConcurrentRequests || this._maxConcurrentRequests;
  }

  get maxConcurrentRequests() {
    return this.levelOfConcern === LevelOfConcern.None
      ? this._maxConcurrentRequests
      : this.levelOfConcern < LevelOfConcern.High
      ? Math.floor(this._maxConcurrentRequests / this.levelOfConcern)
      : 1;
  }

  get throttleTime() {
    return (
      this._throttleTime *
      Math.pow(this.levelOfConcernThrottleBase, this.levelOfConcern)
    );
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
    const start = Date.now();

    logger.debug({ msg: "fetching", entity, fetchCount: this.fetchCount });

    let data: Array<NodeObject> = [];
    try {
      data = await entity.fetch();
    } catch (err) {
      this.raiseConcern();
      this.emit("error", err, {
        responseTime: Date.now() - start,
        fetchCount: this.fetchCount,
      });
    }

    const responseTime = Date.now() - start;
    this.fetchCount--;

    logger.info({
      msg: "fetched",
      entity,
      responseTime,
      fetchCount: this.fetchCount,
    });

    return data;
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

  raiseConcern() {
    if (this.levelOfConcernTimeout) {
      clearTimeout(this.levelOfConcernTimeout);
    }

    this.errorCount++;

    if (
      this.errorCount >=
        this.errorThreshold *
          Math.pow(this.levelOfConcernErrorBase, this.levelOfConcern) &&
      this.levelOfConcern < LevelOfConcern.High
    ) {
      this.levelOfConcern++;
      this.errorCount = 0;

      logger.warn({
        msg: `raised level of concern to ${
          ["None", "Low", "Medium", "High"][this.levelOfConcern]
        }`,
        levelOfConcern: this.levelOfConcern,
      });
    }

    const cooldownTime =
      this.errorCooldown *
      Math.pow(this.levelOfConcernBase, this.levelOfConcern);

    if (this.levelOfConcern === LevelOfConcern.None) {
      return;
    }

    this.levelOfConcernTimeout = setTimeout(() => {
      this.levelOfConcern--;

      logger.warn({
        msg: `lowered level of concern to ${
          ["None", "Low", "Medium", "High"][this.levelOfConcern]
        }`,
        levelOfConcern: this.levelOfConcern,
      });
    }, cooldownTime);
  }
}
