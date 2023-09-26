import { NodeObject } from "jsonld";
import { Readable, ReadableOptions } from "node:stream";
import { Logger } from "pino";
import { Entity } from "../Entity";
import { logger } from "../logger";
import { upperQuartile } from "../util";
import { EntityEndError } from "../EntityEndError";

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
  private _throttleTime = 1000 * 5;
  private maxThrottleTime = 1000 * 30;
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
  private responseTimes: Array<number> = [];
  private responseTimesWaterMark = 10;
  private logger: Logger;

  constructor({
    throttleTime,
    maxConcurrentRequests,
    ...options
  }: ReadableOptions & {
    throttleTime?: number;
    maxConcurrentRequests?: number;
  } = {}) {
    super({ objectMode: true, ...options });
    this.logger = logger.child({ module: this.constructor.name });
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
    const throttleTime =
      this._throttleTime *
      Math.pow(this.levelOfConcernThrottleBase, this.levelOfConcern);
    return Math.min(
      Math.max(throttleTime, this.responseTimeQ3 || 0),
      this.maxThrottleTime
    );
  }

  get responseTimeQ3() {
    const q3 = upperQuartile(this.responseTimes);
    return q3 ? Math.floor(q3) : undefined;
  }

  async _read(): Promise<void> {
    this.stopPushing = false;

    if (this.buffer.length > 0) {
      const continuePushing = this.push(this.buffer.shift());
      if (!continuePushing) {
        this.stopPushing = true;
        return;
      }
    }

    this.requestNextFetch();
  }

  async requestNextFetch(immediate = true) {
    if (
      this.throttleTimeout ||
      this.fetchCount >= this.maxConcurrentRequests ||
      this.shouldEnd
    ) {
      return;
    }

    this.logger.debug({
      msg: "requesting next fetch",
      throttleTime: this.throttleTime,
      fetchCount: this.fetchCount,
    });

    this.throttleTimeout = setTimeout(() => {
      this.logger.debug("saving entites");

      this.entities && Entity.saveEntities(this.entities);
      delete this.throttleTimeout;

      logger.debug({ shouldEnd: this.shouldEnd, fetchCount: this.fetchCount });

      if (this.shouldEnd && this.fetchCount === 0) {
        this.logger.warn({
          msg: "ending stream, pushing null",
          shouldEnd: this.shouldEnd,
        });
        this.push(null);
        return;
      }

      if (this.fetchCount < this.maxConcurrentRequests) {
        this.requestNextFetch();
      }
    }, this.throttleTime);

    if (immediate) {
      const data = await this.fetch();

      if (data.length) {
        return this.handleResult(data);
      }

      this.requestNextFetch(false);
    }
  }

  async fetch(): Promise<Array<NodeObject>> {
    if (!this.entities) {
      this.entities = await Entity.loadEntities();
    }

    const entity = Entity.getNextEntity(this.entities);

    if (!entity) {
      // TODO should log notice and start over
      // this.logger.info("no entitiy, signaling to end stream");
      logger.warn("no entitiy, signaling to end stream");
      this.shouldEnd = true;
      return [];
    }

    this.fetchCount++;
    const start = Date.now();

    this.logger.debug({ msg: "fetching", entity, fetchCount: this.fetchCount });

    let data: Array<NodeObject> = [];
    let responseTime: number;

    try {
      data = await entity.fetch();
      responseTime = Date.now() - start;
    } catch (err) {
      responseTime = Date.now() - start;
      if (err instanceof EntityEndError) {
        logger.info(err);
        Entity.saveEntities(this.entities);
      } else {
        this.raiseConcern();
        this.emit("error", err, {
          responseTime,
          fetchCount: this.fetchCount,
        });
      }
    }

    this.fetchCount--;
    this.responseTimes = this.responseTimes
      .concat(responseTime)
      .slice(-this.responseTimesWaterMark);

    this.logger.info({
      msg: "fetched",
      entity,
      fetchCount: this.fetchCount,
      responseTime,
      responseTimeQ3: this.responseTimeQ3,
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

      this.logger.warn({
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

      this.logger.warn({
        msg: `lowered level of concern to ${
          ["None", "Low", "Medium", "High"][this.levelOfConcern]
        }`,
        levelOfConcern: this.levelOfConcern,
      });
    }, cooldownTime);
  }
}
