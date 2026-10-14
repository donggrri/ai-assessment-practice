export const REQUEST_LIMIT_KEY = "aipractice:request-limit:v1";

export function loadRequestLimitEnabled(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(REQUEST_LIMIT_KEY) === "1";
}

export function saveRequestLimitEnabled(storage: Pick<Storage, "setItem">, enabled: boolean): void {
  storage.setItem(REQUEST_LIMIT_KEY, enabled ? "1" : "0");
}
