export function getParamAsString(
  param: string | string[] | undefined,
  name: string
): string {
  if (!param || typeof param !== "string") {
    throw new Error(`Invalid ${name}`);
  }
  return param;
}