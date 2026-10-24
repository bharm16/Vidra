import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("does not report an emulator restore after a failed connection", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "vidra-restore-"));
  try {
    mkdirSync(path.join(directory, "bin"));
    writeFileSync(path.join(directory, "bin/gsutil"), '#!/bin/bash\nfor destination; do :; done\nmkdir -p "$destination/backup/all_namespaces/all_kinds"\ntouch "$destination/backup/all_namespaces/all_kinds/all_namespaces_all_kinds.export_metadata"\n', { mode: 0o700 });
    writeFileSync(path.join(directory, "bin/curl"), '#!/bin/bash\nexit 7\n', { mode: 0o700 });
    const result = spawnSync("bash", ["scripts/ops/firestore-restore.sh", "--source", "gs://test-only/backup", "--target", "emulator"], { encoding: "utf8", env: { ...process.env, PATH: `${directory}/bin:${process.env.PATH}` } });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("Emulator restore complete");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

async function restoreCase(mode: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const { createServer } = await import("node:http");
  const { spawn } = await import("node:child_process");
  const server = createServer((req, res) => {
    if (mode === "http-error") { res.writeHead(503).end('{"error":"unavailable"}'); return; }
    if (mode === "malformed") { res.end("not json"); return; }
    const document = { fields: { userId: { stringValue: mode === "wrong-fields" ? "other" : "creator" } } };
    if (req.url?.split("?")[0]?.endsWith("/sessions")) res.end(JSON.stringify({ documents: mode === "empty" ? [] : [document] }));
    else if (req.url?.includes("pageSize")) { res.writeHead(400).end(); }
    else res.end(JSON.stringify(document));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test listener");
  const directory = mkdtempSync(path.join(tmpdir(), "vidra-restore-"));
  try {
    mkdirSync(path.join(directory, "bin"));
    writeFileSync(path.join(directory, "bin/gsutil"), '#!/bin/bash\nfor destination; do :; done\nmkdir -p "$destination/backup"\ntouch "$destination/backup/backup.overall_export_metadata"\n', { mode: 0o700 });
    writeFileSync(path.join(directory, "bin/firebase"), '#!/bin/bash\nif [[ "$RESTORE_TEST_MODE" == "unconfirmed" ]]; then exit 0; fi\nFIRESTORE_EMULATOR_HOST="$VIDRA_RESTORE_HOST" "$VIDRA_RESTORE_TSX" "$VIDRA_RESTORE_VERIFIER"\n', { mode: 0o700 });
    const expected = path.join(directory, "expected.json");
    writeFileSync(expected, JSON.stringify({ projectId: "demo-restore", collections: [{ path: "sessions", count: 1 }], documents: [{ path: "sessions/one", fields: { userId: "creator" } }] }));
    return await new Promise((resolve, reject) => {
      const child = spawn("bash", ["scripts/ops/firestore-restore.sh", "--source", "gs://test-only/backup", "--target", "emulator", "--project", "demo-restore", "--expect", expected], { env: { ...process.env, PATH: `${directory}/bin:${process.env.PATH}`, RESTORE_TEST_MODE: mode, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${address.port}` } });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", data => { stdout += String(data); }); child.stderr.on("data", data => { stderr += String(data); });
      child.on("error", reject); child.on("exit", status => resolve({ status, stdout, stderr }));
    });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true }); }
}
it.each(["http-error", "malformed", "empty", "wrong-fields", "unconfirmed"])("refuses unverified restore outcome %s", async mode => {
  const result = await restoreCase(mode);
  expect(result.status).not.toBe(0);
  expect(result.stdout).not.toContain("Emulator restore verified");
});
it("reports verification only after exact counts and sampled ownership match", async () => {
  const result = await restoreCase("success");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Emulator restore verified for demo-restore");
});
