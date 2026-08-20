import { describe, expect, it } from "vitest";

import { createNoopMail } from "./noop.js";

describe("createNoopMail", () => {
  it("send resolves without doing anything", async () => {
    const mail = createNoopMail();
    await expect(mail.send({ to: "a@b.c", subject: "s", text: "t" })).resolves.toBeUndefined();
  });

  it("close resolves without doing anything", async () => {
    const mail = createNoopMail();
    await expect(mail.close()).resolves.toBeUndefined();
  });
});
