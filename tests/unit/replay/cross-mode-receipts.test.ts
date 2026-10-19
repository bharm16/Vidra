import { expect, it } from "vitest";
import { InMemoryIdempotencyService } from "#tests/integration/helpers/cross-mode/boundaryDoubles";

it("a creator reads back only their own settled receipt, as a copy", async () => {
  const store = new InMemoryIdempotencyService();
  const route = "/api/admission/picture";
  const claim = await store.claimRequest({
    userId: "owner",
    route,
    key: "accepted",
    payload: {},
  });
  const other = await store.claimRequest({
    userId: "other",
    route,
    key: "accepted",
    payload: {},
  });
  await store.claimRequest({
    userId: "owner",
    route,
    key: "pending",
    payload: {},
  });
  await store.markCompleted({
    recordId: claim.recordId,
    snapshot: { statusCode: 200, body: { generationId: "owned-take" } },
  });
  await store.markCompleted({
    recordId: other.recordId,
    snapshot: { statusCode: 200, body: { generationId: "private-other-take" } },
  });

  expect(
    await store.getResponseSnapshot({ userId: "owner", route, key: "pending" }),
  ).toBeNull();
  const receipt = await store.getResponseSnapshot({
    userId: "owner",
    route,
    key: "accepted",
  });
  if (!receipt) throw new Error("Accepted receipt missing");
  receipt.body.generationId = "mutated-read";
  expect(
    await store.getResponseSnapshot({
      userId: "owner",
      route,
      key: "accepted",
    }),
  ).toEqual({ statusCode: 200, body: { generationId: "owned-take" } });
});
