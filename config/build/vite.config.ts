import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shouldGenerateSourcemaps =
  Boolean(process.env.SENTRY_AUTH_TOKEN) ||
  process.env.GENERATE_SOURCEMAP === "true";

export default defineConfig(({ mode }) => ({
  root: path.resolve(__dirname, "../../client"),
  envDir: path.resolve(__dirname, "../../"),
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist"),
    sourcemap: shouldGenerateSourcemaps,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-slider",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
          ],
          "vendor-firebase": [
            "firebase/app",
            "firebase/auth",
            "firebase/firestore",
            "firebase/analytics",
          ],
          "vendor-icons": ["@phosphor-icons/react"],
          "vendor-three": ["three"],
        },
      },
    },
  },
  css: {
    postcss: path.resolve(__dirname, "./postcss.config.js"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../client/src"),
      "@components": path.resolve(__dirname, "../../client/src/components"),
      "@features": path.resolve(__dirname, "../../client/src/features"),
      "@hooks": path.resolve(__dirname, "../../client/src/hooks"),
      "@api": path.resolve(__dirname, "../../client/src/api"),
      "@services": path.resolve(__dirname, "../../client/src/services"),
      "@repositories": path.resolve(__dirname, "../../client/src/repositories"),
      "@types": path.resolve(__dirname, "../../client/src/types"),
      "@utils": path.resolve(__dirname, "../../client/src/utils"),
      "@config": path.resolve(__dirname, "../../client/src/config"),
      "@shared": path.resolve(__dirname, "../../shared"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom"],
    esbuildOptions: {
      resolveExtensions: [".jsx", ".js", ".tsx", ".ts"],
    },
  },
  plugins: [
    react(),
    mode === "production" && process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            assets: path.resolve(__dirname, "../../dist/**"),
            ignore: ["node_modules"],
            filesToDeleteAfterUpload: [
              path.resolve(__dirname, "../../dist/**/*.map"),
            ],
          },
          release: {
            name: process.env.VITE_APP_VERSION || "unknown",
            setCommits: {
              auto: true,
              ignoreMissing: true,
            },
          },
        })
      : undefined,
    process.env.ANALYZE_BUNDLE === "true"
      ? visualizer({
          filename: path.resolve(__dirname, "../../dist/bundle-stats.html"),
          gzipSize: true,
          brotliSize: true,
        })
      : undefined,
  ].filter(Boolean) as PluginOption[],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
    fs: {
      allow: [".."],
    },
  },
  publicDir: path.resolve(__dirname, "../../client/public"),
}));
