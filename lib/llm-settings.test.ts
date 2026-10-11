import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearLlmSettings,
  isMockMode,
  loadLlmSettings,
  normalizeBaseUrl,
  saveLlmSettings,
} from "./llm-settings";

const STORAGE_KEY = "aipractice:llm:v1";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

function defaultSettings() {
  return {
    apiKey: "",
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
  };
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    snapshot() {
      return new Map(store);
    },
  };
}

describe("loadLlmSettings", () => {
  it("빈 저장소이면 기본 apiKey·baseUrl·model을 반환한다", () => {
    const storage = createMemoryStorage();
    assert.deepEqual(loadLlmSettings(storage), defaultSettings());
  });

  it("잘못된 JSON이면 기본값을 반환하고 예외를 던지지 않는다", () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: "{not-json",
    });
    assert.deepEqual(loadLlmSettings(storage), defaultSettings());
  });

  it("getItem이 throw하면 기본값을 반환한다", () => {
    const storage = {
      getItem() {
        throw new Error("storage unavailable");
      },
      setItem() {},
      removeItem() {},
    };
    assert.deepEqual(loadLlmSettings(storage), defaultSettings());
  });

  it("저장된 설정을 읽어온다", () => {
    const payload = {
      apiKey: "sk-test",
      baseUrl: "https://example.com/v1",
      model: "gpt-4o",
    };
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify(payload),
    });
    assert.deepEqual(loadLlmSettings(storage), payload);
  });
});

describe("saveLlmSettings", () => {
  it("aipractice:llm:v1 키에 apiKey·baseUrl·model을 저장하고 ok:true를 반환한다", () => {
    const storage = createMemoryStorage();
    const settings = {
      apiKey: "sk-test",
      baseUrl: "https://custom.example/v1",
      model: "gpt-4o-mini",
    };
    assert.deepEqual(saveLlmSettings(settings, storage), { ok: true });
    assert.equal(storage.getItem(STORAGE_KEY), JSON.stringify(settings));
  });

  it("setItem이 throw하면 ok:false만 반환한다", () => {
    const storage = {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error("quota exceeded");
      },
      removeItem() {},
    };
    assert.deepEqual(
      saveLlmSettings(
        { apiKey: "sk-test", baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL },
        storage,
      ),
      { ok: false },
    );
  });
});

describe("clearLlmSettings", () => {
  it("aipractice:llm:v1 키를 제거하고 ok:true를 반환한다", () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify(defaultSettings()),
    });
    assert.deepEqual(clearLlmSettings(storage), { ok: true });
    assert.equal(storage.getItem(STORAGE_KEY), null);
  });

  it("removeItem이 throw하면 ok:false를 반환한다", () => {
    const storage = {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {
        throw new Error("denied");
      },
    };
    assert.deepEqual(clearLlmSettings(storage), { ok: false });
  });
});

describe("normalizeBaseUrl", () => {
  it('끝 슬래시를 제거해 "https://api.openai.com/v1"로 만든다', () => {
    assert.equal(normalizeBaseUrl("https://api.openai.com/v1/"), DEFAULT_BASE_URL);
  });

  it("빈 문자열이면 기본 OpenAI v1 URL을 반환한다", () => {
    assert.equal(normalizeBaseUrl(""), DEFAULT_BASE_URL);
  });
});

describe("isMockMode", () => {
  it("apiKey가 비어 있거나 공백만이면 true이다", () => {
    assert.equal(isMockMode({ ...defaultSettings(), apiKey: "" }), true);
    assert.equal(isMockMode({ ...defaultSettings(), apiKey: "   \t\n" }), true);
  });

  it('apiKey가 "sk-test"이면 false이다', () => {
    assert.equal(
      isMockMode({ ...defaultSettings(), apiKey: "sk-test" }),
      false,
    );
  });
});
