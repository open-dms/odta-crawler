import { err as errSerializer } from "pino-std-serializers";

export function errorSerializer(err: Error) {
  const obj = errSerializer(err);

  if (
    err.cause !== undefined &&
    typeof err.cause === "object" &&
    !(err.cause instanceof Error)
  ) {
    obj.cause = err.cause as never;
  }

  return obj;
}
