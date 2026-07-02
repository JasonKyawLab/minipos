import { appError } from "./appError.js";

export function getParamAsString(
  param: string | string[] | undefined,
  name: string
): string {
  if (!param || typeof param !== "string") {
    throw new appError(`INVALID_PARAM_${name.toUpperCase()}`, 400);
  }
  return param;
}