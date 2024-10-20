export * from "./crawl";
export * from "./cursor";

export const getValueUsingPath = (record: Record<string, any>, path: string[]) => {
  if (!record || path.length === 0) return record;

  for (let i = 0; i < path.length; i++) {
    if (!record || typeof record !== "object") throw new Error();
    record = record[path[i]];
  }
  return record;
};
