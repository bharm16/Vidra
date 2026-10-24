import { afterAll, expect, it } from "vitest";
import { SessionStore } from "@services/sessions/SessionStore";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const first = createWorkflowTestDatabase();
const second = createWorkflowTestDatabase();
afterAll(async () => { await Promise.all([first.terminate(), second.terminate()]); });
it("isolates legacy session adapters without replacing global Firebase state", async () => {
  const a = new SessionStore(first); const b = new SessionStore(second);
  const session = { id: "same-session", userId: "first-owner", status: "active" as const, createdAt: new Date(), updatedAt: new Date() };
  await a.save(session); await b.save({ ...session, userId: "second-owner" });
  expect((await a.get(session.id))?.userId).toBe("first-owner");
  expect((await b.get(session.id))?.userId).toBe("second-owner");
  await a.delete(session.id);
  expect(await a.get(session.id)).toBeNull();
  expect((await b.get(session.id))?.userId).toBe("second-owner");
});
