#!/usr/bin/env node

/**
 * Highlighting Performance Stats Extractor
 *
 * Extracts and displays performance metrics for span labeling/highlighting
 * Run with: npm run highlight-stats
 *
 * Prerequisites:
 * - App must be running on localhost:5173
 * - Navigate to a page with highlighting before running
 */

import { chromium } from "playwright";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 100) return `${ms.toFixed(2)}ms`;
  return `${ms.toFixed(0)}ms`;
}

function getColorForDuration(
  ms: number,
  thresholds = { good: 50, warning: 200 },
): string {
  if (ms <= thresholds.good) return colors.green;
  if (ms <= thresholds.warning) return colors.yellow;
  return colors.red;
}

async function extractHighlightStats() {
  const browser = await chromium.launch({
    headless: false, // Set to true if you don't want to see the browser
  });

  try {
    // Connect to existing page or create new one
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`${colors.cyan}Connecting to app...${colors.reset}`);

    // Navigate to the app
    await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

    // Wait a moment for any highlighting to occur
    await page.waitForTimeout(2000);

    // Extract performance metrics from the browser
    const metrics = await page.evaluate(() => {
      const allMeasures = performance.getEntriesByType("measure");
      const allMarks = performance.getEntriesByType("mark");

      // Group metrics by category
      const spanMetrics = allMeasures.filter(
        (m) => m.name.includes("span") || m.name.includes("highlight"),
      );

      const optimizationMetrics = allMeasures.filter(
        (m) =>
          m.name.includes("optimize") ||
          m.name.includes("draft") ||
          m.name.includes("refined"),
      );

      // Extract specific metrics
      const criticalMetric = performance.getEntriesByName(
        "CRITICAL-prompt-to-highlights",
        "measure",
      )[0];
      const cacheHits = performance.getEntriesByName(
        "span-labeling-cache-hit",
        "measure",
      );
      const apiCalls = performance.getEntriesByName(
        "span-api-duration",
        "measure",
      );
      const totalSpanLabeling = performance.getEntriesByName(
        "span-labeling-total",
        "measure",
      );

      // Calculate statistics
      const stats = {
        spanLabeling: {
          cacheHits: cacheHits.map((m) => m.duration),
          apiCalls: apiCalls.map((m) => m.duration),
          totalTimes: totalSpanLabeling.map((m) => m.duration),
        },
        critical: criticalMetric ? criticalMetric.duration : null,
        optimization: {
          draft: performance.getEntriesByName("optimize-to-draft", "measure")[0]
            ?.duration,
          refined: performance.getEntriesByName(
            "draft-to-refined",
            "measure",
          )[0]?.duration,
          total: performance.getEntriesByName(
            "optimize-to-refined-total",
            "measure",
          )[0]?.duration,
        },
        allSpanMetrics: spanMetrics.map((m) => ({
          name: m.name,
          duration: m.duration,
          startTime: m.startTime,
        })),
        marks: allMarks.map((m) => m.name),
        cacheHitRate: 0,
      };

      // Add cache hit rate
      const totalRequests = cacheHits.length + apiCalls.length;
      stats.cacheHitRate =
        totalRequests > 0 ? (cacheHits.length / totalRequests) * 100 : 0;

      return stats;
    });

    // Display results
    console.log(
      `\n${colors.bold}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
    );
    console.log(
      `${colors.bold}${colors.cyan}       HIGHLIGHTING PERFORMANCE STATISTICS${colors.reset}`,
    );
    console.log(
      `${colors.bold}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`,
    );

    // Critical Metric
    if (metrics.critical !== null) {
      const color = getColorForDuration(metrics.critical, {
        good: 290,
        warning: 600,
      });
      console.log(
        `${colors.bold}🎯 CRITICAL METRIC (Prompt → Highlights)${colors.reset}`,
      );
      console.log(
        `   ${color}${formatDuration(metrics.critical)}${colors.reset} ${metrics.critical <= 290 ? "✅ PASS" : "❌ FAIL"} (target: ≤290ms)\n`,
      );
    } else {
      console.log(
        `${colors.dim}🎯 CRITICAL METRIC: No data (navigate to a prompt with highlights)${colors.reset}\n`,
      );
    }

    // Span Labeling Performance
    console.log(`${colors.bold}⚡ SPAN LABELING PERFORMANCE${colors.reset}`);

    if (metrics.spanLabeling.cacheHits.length > 0) {
      const avgCacheHit =
        metrics.spanLabeling.cacheHits.reduce((a, b) => a + b, 0) /
        metrics.spanLabeling.cacheHits.length;
      const minCacheHit = Math.min(...metrics.spanLabeling.cacheHits);
      const maxCacheHit = Math.max(...metrics.spanLabeling.cacheHits);

      console.log(`   ${colors.green}Cache Hits:${colors.reset}`);
      console.log(`     Count: ${metrics.spanLabeling.cacheHits.length}`);
      console.log(
        `     Avg: ${colors.green}${formatDuration(avgCacheHit)}${colors.reset}`,
      );
      console.log(
        `     Min: ${formatDuration(minCacheHit)} | Max: ${formatDuration(maxCacheHit)}`,
      );
    }

    if (metrics.spanLabeling.apiCalls.length > 0) {
      const avgApiCall =
        metrics.spanLabeling.apiCalls.reduce((a, b) => a + b, 0) /
        metrics.spanLabeling.apiCalls.length;
      const minApiCall = Math.min(...metrics.spanLabeling.apiCalls);
      const maxApiCall = Math.max(...metrics.spanLabeling.apiCalls);

      console.log(`   ${colors.yellow}API Calls:${colors.reset}`);
      console.log(`     Count: ${metrics.spanLabeling.apiCalls.length}`);
      console.log(
        `     Avg: ${getColorForDuration(avgApiCall, { good: 200, warning: 500 })}${formatDuration(avgApiCall)}${colors.reset}`,
      );
      console.log(
        `     Min: ${formatDuration(minApiCall)} | Max: ${formatDuration(maxApiCall)}`,
      );
    }

    // Cache Hit Rate
    if (metrics.cacheHitRate > 0 || metrics.spanLabeling.apiCalls.length > 0) {
      const rateColor =
        metrics.cacheHitRate >= 70
          ? colors.green
          : metrics.cacheHitRate >= 50
            ? colors.yellow
            : colors.red;
      console.log(
        `\n   ${colors.bold}Cache Hit Rate:${colors.reset} ${rateColor}${metrics.cacheHitRate.toFixed(1)}%${colors.reset}`,
      );
    }

    // Optimization Metrics
    if (
      metrics.optimization.draft ||
      metrics.optimization.refined ||
      metrics.optimization.total
    ) {
      console.log(`\n${colors.bold}🚀 OPTIMIZATION PERFORMANCE${colors.reset}`);

      if (metrics.optimization.draft) {
        console.log(
          `   Draft Generation: ${getColorForDuration(metrics.optimization.draft, { good: 500, warning: 1000 })}${formatDuration(metrics.optimization.draft)}${colors.reset}`,
        );
      }
      if (metrics.optimization.refined) {
        console.log(
          `   Refinement: ${getColorForDuration(metrics.optimization.refined, { good: 5000, warning: 8000 })}${formatDuration(metrics.optimization.refined)}${colors.reset}`,
        );
      }
      if (metrics.optimization.total) {
        console.log(
          `   Total Time: ${getColorForDuration(metrics.optimization.total, { good: 6000, warning: 10000 })}${formatDuration(metrics.optimization.total)}${colors.reset}`,
        );
      }
    }

    // All span-related metrics
    if (metrics.allSpanMetrics.length > 0) {
      console.log(`\n${colors.bold}📊 ALL SPAN METRICS${colors.reset}`);

      const sortedMetrics = metrics.allSpanMetrics.sort(
        (a, b) => b.duration - a.duration,
      );
      const topMetrics = sortedMetrics.slice(0, 5);

      topMetrics.forEach((metric) => {
        const color = getColorForDuration(metric.duration, {
          good: 100,
          warning: 500,
        });
        console.log(
          `   ${metric.name}: ${color}${formatDuration(metric.duration)}${colors.reset}`,
        );
      });

      if (sortedMetrics.length > 5) {
        console.log(
          `   ${colors.dim}... and ${sortedMetrics.length - 5} more metrics${colors.reset}`,
        );
      }
    }

    // Performance Marks Available
    if (metrics.marks.length > 0) {
      const uniqueMarks = [...new Set(metrics.marks)];
      console.log(
        `\n${colors.bold}🏁 PERFORMANCE MARKS AVAILABLE${colors.reset}`,
      );
      console.log(`   ${colors.dim}${uniqueMarks.join(", ")}${colors.reset}`);
    }

    // Summary
    console.log(
      `\n${colors.bold}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
    );

    // Performance Grade
    let grade = "A+";
    let gradeColor = colors.green;

    if (metrics.critical !== null) {
      if (metrics.critical > 600) {
        grade = "C";
        gradeColor = colors.red;
      } else if (metrics.critical > 400) {
        grade = "B";
        gradeColor = colors.yellow;
      } else if (metrics.critical > 290) {
        grade = "B+";
        gradeColor = colors.yellow;
      } else if (metrics.critical > 200) {
        grade = "A";
        gradeColor = colors.green;
      }
    }

    console.log(
      `${colors.bold}Performance Grade: ${gradeColor}${grade}${colors.reset}`,
    );

    if (metrics.cacheHitRate >= 70) {
      console.log(
        `${colors.green}✅ Excellent cache hit rate (${metrics.cacheHitRate.toFixed(1)}%)${colors.reset}`,
      );
    } else if (metrics.cacheHitRate >= 50) {
      console.log(
        `${colors.yellow}⚠️  Cache hit rate could be improved (${metrics.cacheHitRate.toFixed(1)}%)${colors.reset}`,
      );
    } else if (metrics.spanLabeling.apiCalls.length > 0) {
      console.log(
        `${colors.red}❌ Low cache hit rate (${metrics.cacheHitRate.toFixed(1)}%)${colors.reset}`,
      );
    }

    console.log(
      `\n${colors.dim}Tip: Navigate to different prompts to collect more performance data${colors.reset}`,
    );
    console.log(
      `${colors.dim}Run 'npm run highlight-stats:watch' to monitor continuously${colors.reset}\n`,
    );
  } catch (error) {
    console.error(
      `${colors.red}Error extracting metrics:${colors.reset}`,
      error instanceof Error ? error.message : String(error),
    );
    console.log(`\n${colors.yellow}Make sure:${colors.reset}`);
    console.log(`  1. The app is running on http://localhost:5173`);
    console.log(`  2. You're on a page with text highlighting enabled`);
    console.log(
      `  3. Some text has been highlighted (type in the prompt editor)`,
    );
  } finally {
    await browser.close();
  }
}

// Handle watch mode
const watchMode =
  process.argv.includes("--watch") || process.argv.includes("-w");

if (watchMode) {
  console.log(
    `${colors.cyan}${colors.bold}Starting continuous monitoring...${colors.reset}`,
  );
  console.log(`${colors.dim}Press Ctrl+C to stop${colors.reset}\n`);

  // Run immediately
  await extractHighlightStats();

  // Then run every 5 seconds
  setInterval(async () => {
    console.clear();
    await extractHighlightStats();
  }, 5000);
} else {
  await extractHighlightStats();
}
