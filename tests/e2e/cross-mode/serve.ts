import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "vite";
import {
  startCrossModeHarness,
  CROSS_MODE_USER_ID,
} from "#tests/integration/helpers/cross-mode/harness";
import type { InMemoryObjectStore } from "#tests/integration/helpers/cross-mode/boundaryDoubles";

process.env.GCS_BUCKET_NAME = "prompt-builder-test-bucket";
process.env.ALLOWED_ORIGINS = "http://127.0.0.1:58141";
process.env.ENABLE_CONVERGENCE = "false";
process.env.VIDEO_GENERATE_IDEMPOTENCY_MODE = "soft";
process.env.VITE_FIREBASE_API_KEY = "synthetic-firebase-key";
process.env.VITE_FIREBASE_PROJECT_ID = "demo-browser-proof";
process.env.VIDEO_JOB_WORKER_ENABLED = "false";
process.env.VIDEO_JOB_INLINE_ENABLED = "true";
process.env.DEPTH_WARMUP_ON_STARTUP = "false";

const frame = await readFile(new URL("./frame.png", import.meta.url));
const blueFrame = await readFile(new URL("./frame-blue.png", import.meta.url));
const clip = await readFile(new URL("./clip.mp4", import.meta.url));
const providerCalls: Array<Record<string, unknown>> = [];
let objectStore: InMemoryObjectStore | undefined;
let failAppend = false;
let failArming = false;
let depthAvailable = false;
const depthInputs: Array<unknown> = [];

const harness = await startCrossModeHarness({
  outboundRoutes: {
    "queue.fal.run": async (value, init): Promise<Response> => {
      const url = new URL(value);
      const endpoint = "/fal-ai/image-preprocessors/depth-anything/v2";
      if (
        !depthAvailable ||
        !(
          url.pathname.startsWith(endpoint) ||
          url.pathname.startsWith(
            "/fal-ai/image-preprocessors/requests/browser-depth-fixture",
          )
        )
      )
        throw new Error("Unscripted fal queue request");
      const requestId = "browser-depth-fixture";
      const responseUrl = `https://queue.fal.run${endpoint}/requests/${requestId}`;
      const queue = {
        request_id: requestId,
        status: "COMPLETED",
        response_url: responseUrl,
        status_url: `${responseUrl}/status`,
        cancel_url: `${responseUrl}/cancel`,
        logs: [],
      };
      if (init?.method === "POST") {
        depthInputs.push(JSON.parse(String(init.body)) as unknown);
        return Response.json(queue);
      }
      if (url.pathname.endsWith("/status")) return Response.json(queue);
      if (!objectStore) throw new Error("Object boundary unavailable");
      return Response.json({
        image: {
          url: objectStore.urlFor("provider/depth-fixture.png"),
          width: 32,
          height: 32,
        },
      });
    },
  },
  async configureBoundaries({
    container,
    objects,
    sessions,
    storage,
    studioProjects,
    idempotency,
  }): Promise<void> {
    objectStore = objects;
    objects.put("provider/depth-fixture.png", {
      buffer: frame,
      contentType: "image/png",
    });
    const {
      BrowserAIProvider,
      BrowserVideoJobStore,
      BrowserVideoAssets,
      browserVideoProvider,
      browserStudioRunner,
    } = await import("./controlledPorts");
    const { StudioService } = await import("@services/studio/StudioService");
    const { StudioPolicyEngine } = await import(
      "@services/studio/StudioPolicyEngine"
    );
    const { StudioModelRegistry } = await import(
      "@services/studio/StudioModelRegistry"
    );
    const { VideoGenerationService } = await import(
      "@services/video-generation/VideoGenerationService"
    );
    const ai = new BrowserAIProvider();
    container.registerValue("aiService", ai);
    container.registerValue(
      "studioService",
      new StudioService({
        store: studioProjects,
        storage,
        registry: new StudioModelRegistry(),
        runner: browserStudioRunner(objects, frame),
        policy: new StudioPolicyEngine({ ai }),
        dailyCapCents: 500,
      }),
    );
    container.registerValue(
      "sketchRelayFetch",
      async (_url: string, init?: RequestInit): Promise<Response> => {
        const input = JSON.parse(String(init?.body ?? "{}")) as {
          prompt?: string;
        };
        const shownFrame = input.prompt?.includes("bottle") ? blueFrame : frame;
        return Response.json({
          images: [
            {
              url: `data:image/png;base64,${shownFrame.toString("base64")}`,
              width: 32,
              height: 32,
            },
          ],
        });
      },
    );
    container.registerValue(
      "videoJobStore",
      new BrowserVideoJobStore(idempotency),
    );
    container.registerValue(
      "videoGenerationService",
      new VideoGenerationService({
        providers: {
          replicate: browserVideoProvider("replicate", clip, providerCalls),
          openai: browserVideoProvider("openai", clip, providerCalls),
          luma: browserVideoProvider("luma", clip, providerCalls),
          gemini: browserVideoProvider("gemini", clip, providerCalls),
          kling: browserVideoProvider("kling", clip, providerCalls),
        },
        assetStore: new BrowserVideoAssets(objects),
      }),
    );
    const mutate = sessions.mutate.bind(sessions);
    sessions.mutate = async (
      ...args: Parameters<typeof mutate>
    ): ReturnType<typeof mutate> => {
      if (failAppend) throw new Error("Injected persistence outage");
      return mutate(args[0], (current) => {
        const next = args[1](current);
        if (
          failArming &&
          JSON.stringify(current.prompt?.keyframes) !==
            JSON.stringify(next.prompt?.keyframes)
        ) {
          throw new Error("Injected first-frame persistence outage");
        }
        return next;
      });
    };
  },
});

// The mounted sketch relay captured its synthetic key at registration. Depth's
// independent factory reads env per request; exercise the real unavailable
// response without constructing a paid depth client.
for (const key of ["FAL_KEY", "FAL_API_KEY", "FAL_KEY_ID", "FAL_KEY_SECRET"])
  delete process.env[key];

const vite = await createServer({
  configFile: "config/build/vite.config.ts",
  plugins: [
    {
      name: "cross-mode-browser-controls",
      configureServer(server): void {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/__test/")) {
            next();
            return;
          }
          void control(req, res).catch((error: unknown) => {
            res.statusCode = 500;
            res.end(String(error));
          });
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 58141,
    strictPort: true,
    proxy: {
      "/api": { target: harness.baseUrl, changeOrigin: true },
      "/health": { target: harness.baseUrl },
    },
  },
});

const control = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:58141");
  if (url.pathname === "/__test/objects") {
    const path = url.searchParams.get("path") ?? "";
    const object = objectStore?.get(path);
    res.statusCode = object ? 200 : 404;
    if (object) {
      res.setHeader("content-type", object.contentType);
      res.setHeader("accept-ranges", "bytes");
      const size = object.buffer.byteLength;
      const range = req.headers.range;
      let start = 0;
      let end = size - 1;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2])) {
          start = match[1]
            ? Number(match[1])
            : Math.max(0, size - Number(match[2]));
          end =
            match[1] && match[2]
              ? Math.min(Number(match[2]), size - 1)
              : size - 1;
        }
        if (
          !match ||
          (!match[1] && !match[2]) ||
          (!match[1] && Number(match[2]) === 0) ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start >= size ||
          end < start
        ) {
          res.statusCode = 416;
          res.setHeader("content-range", `bytes */${size}`);
          res.end();
          return;
        }
        res.statusCode = 206;
        res.setHeader("content-range", `bytes ${start}-${end}/${size}`);
      }
      const body = object.buffer.subarray(start, end + 1);
      res.setHeader("content-length", body.byteLength);
      res.end(req.method === "HEAD" ? undefined : body);
    } else res.end();
    return;
  }
  if (url.pathname === "/__test/fault") {
    failAppend = url.searchParams.get("append") === "fail";
    failArming = url.searchParams.get("arm") === "fail";
    depthAvailable = url.searchParams.get("depth") === "available";
    if (depthAvailable) process.env.FAL_KEY = "synthetic-depth-key";
    else delete process.env.FAL_KEY;
    if (url.searchParams.get("concurrent") === "2")
      harness.images.releaseTogether(2);
    res.end("ok");
    return;
  }
  if (url.pathname === "/__test/state") {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        sessions: await harness.sessions.findByUser(CROSS_MODE_USER_ID),
        providerCalls,
        outbound: harness.guard.violations,
        depthInputs,
      }),
    );
    return;
  }
  if (url.pathname === "/__test/expire") {
    const session = await harness.sessions.get(
      url.searchParams.get("sessionId") ?? "",
    );
    if (!session?.prompt) {
      res.statusCode = 404;
      res.end();
      return;
    }
    await harness.sessions.save({
      ...session,
      prompt: {
        ...session.prompt,
        versions: session.prompt.versions?.map((version) => ({
          ...version,
          generations: version.generations?.map((take) => ({
            ...take,
            mediaUrls: [`https://expired.media.invalid/${take.id}.png`],
          })),
        })),
        keyframes: session.prompt.keyframes?.map((frame) => ({
          ...frame,
          url: `https://expired.media.invalid/${frame.id}.png`,
        })),
      },
    });
    res.end("ok");
    return;
  }
  res.statusCode = 404;
  res.end();
};

await vite.listen();
console.log(
  "Cross-mode offline browser server listening at http://127.0.0.1:58141",
);
const close = async (): Promise<void> => {
  await vite.close();
  await harness.close();
  process.exit(0);
};
process.on("SIGTERM", () => {
  void close();
});
process.on("SIGINT", () => {
  void close();
});
