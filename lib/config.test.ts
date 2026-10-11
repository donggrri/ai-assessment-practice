import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readBuildConfig } from "./config";

const ENV_KEYS = [
  "CONTEXT_CHAR_LIMIT",
  "AI_REQUEST_LIMIT",
  "COPY_PROTECTION",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
] as const;

function withEnv(
  overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  fn: () => void,
) {
  const keys = Object.keys(overrides) as (typeof ENV_KEYS)[number][];
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
    {};
  for (const key of keys) {
    saved[key] = process.env[key];
  }
  for (const key of keys) {
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const key of keys) {
      const prev = saved[key];
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
  }
}

function assertNoSecretOrOpenAiFields(result: Record<string, unknown>) {
  const forbidden = ["apiKey", "mockMode", "model", "baseUrl"];
  for (const key of forbidden) {
    assert.equal(key in result, false, `${key} 필드가 있으면 안 된다`);
  }
  for (const key of Object.keys(result)) {
    assert.ok(
      !key.toUpperCase().includes("OPENAI"),
      `OPENAI 관련 필드 ${key}가 있으면 안 된다`,
    );
  }
}

describe("readBuildConfig", () => {
  describe("contextCharLimit", () => {
    it("CONTEXT_CHAR_LIMIT 미설정이면 20000이다", () => {
      withEnv({ CONTEXT_CHAR_LIMIT: undefined }, () => {
        const result = readBuildConfig();
        assert.equal(result.contextCharLimit, 20_000);
        assertNoSecretOrOpenAiFields(result);
      });
    });

    it('CONTEXT_CHAR_LIMIT이 빈 문자열이면 20000이다', () => {
      withEnv({ CONTEXT_CHAR_LIMIT: "" }, () => {
        assert.equal(readBuildConfig().contextCharLimit, 20_000);
      });
    });

    it("CONTEXT_CHAR_LIMIT이 음수이면 20000이다", () => {
      withEnv({ CONTEXT_CHAR_LIMIT: "-1" }, () => {
        assert.equal(readBuildConfig().contextCharLimit, 20_000);
      });
    });

    it("CONTEXT_CHAR_LIMIT이 비숫자이면 20000이다", () => {
      withEnv({ CONTEXT_CHAR_LIMIT: "abc" }, () => {
        assert.equal(readBuildConfig().contextCharLimit, 20_000);
      });
    });

    it('CONTEXT_CHAR_LIMIT이 "1500"이면 1500이다', () => {
      withEnv({ CONTEXT_CHAR_LIMIT: "1500" }, () => {
        assert.equal(readBuildConfig().contextCharLimit, 1500);
      });
    });
  });

  describe("aiRequestLimit", () => {
    it("AI_REQUEST_LIMIT 미설정이면 10이다", () => {
      withEnv({ AI_REQUEST_LIMIT: undefined }, () => {
        assert.equal(readBuildConfig().aiRequestLimit, 10);
      });
    });

    it('AI_REQUEST_LIMIT이 빈 문자열이면 10이다', () => {
      withEnv({ AI_REQUEST_LIMIT: "" }, () => {
        assert.equal(readBuildConfig().aiRequestLimit, 10);
      });
    });

    it("AI_REQUEST_LIMIT이 음수이면 10이다", () => {
      withEnv({ AI_REQUEST_LIMIT: "-5" }, () => {
        assert.equal(readBuildConfig().aiRequestLimit, 10);
      });
    });

    it("AI_REQUEST_LIMIT이 비숫자이면 10이다", () => {
      withEnv({ AI_REQUEST_LIMIT: "nope" }, () => {
        assert.equal(readBuildConfig().aiRequestLimit, 10);
      });
    });

    it('AI_REQUEST_LIMIT이 "3"이면 3이다', () => {
      withEnv({ AI_REQUEST_LIMIT: "3" }, () => {
        assert.equal(readBuildConfig().aiRequestLimit, 3);
      });
    });
  });

  describe("copyProtection", () => {
    it("COPY_PROTECTION 미설정이면 true이다", () => {
      withEnv({ COPY_PROTECTION: undefined }, () => {
        assert.equal(readBuildConfig().copyProtection, true);
      });
    });

    it('COPY_PROTECTION이 "false"이면 false이다', () => {
      withEnv({ COPY_PROTECTION: "false" }, () => {
        assert.equal(readBuildConfig().copyProtection, false);
      });
    });

    it('COPY_PROTECTION이 "FALSE"이면 false이다(대소문자 무시)', () => {
      withEnv({ COPY_PROTECTION: "FALSE" }, () => {
        assert.equal(readBuildConfig().copyProtection, false);
      });
    });

    it('COPY_PROTECTION이 "0"이면 false이다', () => {
      withEnv({ COPY_PROTECTION: "0" }, () => {
        assert.equal(readBuildConfig().copyProtection, false);
      });
    });

    it('COPY_PROTECTION이 "off"이면 false이다', () => {
      withEnv({ COPY_PROTECTION: "off" }, () => {
        assert.equal(readBuildConfig().copyProtection, false);
      });
    });

    it('COPY_PROTECTION이 "OFF"이면 false이다(대소문자 무시)', () => {
      withEnv({ COPY_PROTECTION: "OFF" }, () => {
        assert.equal(readBuildConfig().copyProtection, false);
      });
    });

    it('COPY_PROTECTION이 "true"이면 true이다', () => {
      withEnv({ COPY_PROTECTION: "true" }, () => {
        assert.equal(readBuildConfig().copyProtection, true);
      });
    });

    it('COPY_PROTECTION이 "yes"이면 true이다', () => {
      withEnv({ COPY_PROTECTION: "yes" }, () => {
        assert.equal(readBuildConfig().copyProtection, true);
      });
    });
  });

  it("OPENAI_API_KEY가 있어도 반환 객체에 apiKey·mockMode·model·baseUrl·OPENAI 관련 필드가 없다", () => {
    withEnv(
      {
        OPENAI_API_KEY: "sk-test-should-not-appear",
        OPENAI_MODEL: "gpt-4o",
        OPENAI_BASE_URL: "https://custom.example/v1",
        CONTEXT_CHAR_LIMIT: undefined,
        AI_REQUEST_LIMIT: undefined,
        COPY_PROTECTION: undefined,
      },
      () => {
        const result = readBuildConfig();
        assertNoSecretOrOpenAiFields(result as Record<string, unknown>);
        assert.deepEqual(Object.keys(result).sort(), [
          "aiRequestLimit",
          "contextCharLimit",
          "copyProtection",
        ]);
      },
    );
  });
});
