export function memoStorageKey(groupId: string): string {
  return `aipractice:memo:v1:${groupId}`;
}

export function loadMemo(storage: Pick<Storage, "getItem">, groupId: string): string {
  if (!groupId) return "";
  try {
    return storage.getItem(memoStorageKey(groupId)) ?? "";
  } catch {
    return "";
  }
}

export function saveMemo(storage: Pick<Storage, "setItem">, groupId: string, text: string): void {
  if (!groupId) return;
  try {
    storage.setItem(memoStorageKey(groupId), text);
  } catch {
    // 저장 공간이 없거나 막혀 있어도 화면은 멈추지 않는다.
  }
}
