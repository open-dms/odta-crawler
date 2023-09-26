import { Entity } from "./Entity";

export class EntityEndError extends Error {
  cause: { entity: Entity };

  constructor(entity: Entity) {
    super(`Entity end reached`);
    this.cause = { entity };
  }
}
