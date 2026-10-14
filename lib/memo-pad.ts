export function memoStorageKey(groupId: string): string {
  return `aipractice:memo:v1:${groupId}`;
}

export function loadMemo(storage: Pick<Storage, "getItem">, groupId: string): string {
  if (!groupId) return "";
  return storage.getItem(memoStorageKey(groupId)) ?? "";
}

export function saveMemo(storage: Pick<Storage, "setItem">, groupId: string, text: string): void {
  if (!groupId) return;
  storage.setItem(memoStorageKey(groupId), text);
}
