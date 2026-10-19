import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";

export interface GalleryCapture { name: string; file: string; sourceKeys: string[]; url: string; width: number; height: number; scrollWidth: number; boundary: string; }
/** Used only after functional QA. Capture does not manipulate application state. */
export class WorkflowGallery {
  readonly captures: GalleryCapture[] = [];
  readonly root: string;
  constructor(root = process.env.WORKFLOW_GALLERY_OUTPUT ?? "output/playwright/integrated-workflow") { this.root = resolve(root); }
  async capture(page: Page, name: string, sourceKeys: string[] = [], boundary = "Real host routes, isolated Firestore emulator, controlled provider bytes and immutable storage; no live provider claim."): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const filename = `${name}.png`;
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: join(this.root, filename), fullPage: true, animations: "disabled" });
    const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }));
    this.captures.push({ name, file: filename, sourceKeys, url: page.url(), ...geometry, boundary });
    await this.save();
  }
  async save(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, "screenshots.json"), JSON.stringify({ evidence: "Provider-free integrated browser execution, with real Firestore services, content verification and native FFmpeg rendering. Auth identity uses the established MockAuthRepository E2E hook. Screenshots do not prove live provider quality, deployed infrastructure or native OS file-save acceptance.", captures: this.captures }, null, 2));
    const escape = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    await writeFile(join(this.root, "index.html"), `<!doctype html><meta charset="utf-8"><title>Vidra integrated browser evidence</title><style>body{margin:0;background:#111;color:#eee;font:15px system-ui}header{padding:32px;max-width:1000px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:24px;padding:24px}figure{margin:0;border:1px solid #363636;border-radius:12px;overflow:hidden}figcaption{padding:16px}img{display:block;width:100%;height:auto}small{color:#aaa}</style><header><h1>Vidra integrated browser evidence</h1><p>Real host routes and isolated Firestore services. External image, clip and Sketch providers use controlled bytes. Native editor preview/export uses local FFmpeg. No live model-quality or deployed-infrastructure claim.</p></header><main>${this.captures.map(capture => `<figure><a href="${escape(capture.file)}"><img loading="lazy" src="${escape(capture.file)}" alt="${escape(capture.name)}"></a><figcaption>${escape(capture.name)}<br><small>${escape(capture.sourceKeys.join(", "))} · ${capture.width} × ${capture.height}</small></figcaption></figure>`).join("")}</main>`);
  }
}
