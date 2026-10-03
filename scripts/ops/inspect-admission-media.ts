import { readFileSync } from "node:fs";
import { inspectAdmissionMedia } from "./admission-media-inventory.ts";

const args = process.argv.slice(2);
if (args.length !== 1 || !args[0] || args[0].startsWith("-")) {
  console.error(
    "Usage: npx tsx scripts/ops/inspect-admission-media.ts <inventory.json> (dry-run only)",
  );
  process.exitCode = 2;
} else {
  try {
    const report = inspectAdmissionMedia(
      JSON.parse(readFileSync(args[0], "utf8")) as unknown,
    );
    console.log(JSON.stringify(report, null, 2));
    if (!report.verified) process.exitCode = 2;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Inventory could not be read",
    );
    process.exitCode = 2;
  }
}
