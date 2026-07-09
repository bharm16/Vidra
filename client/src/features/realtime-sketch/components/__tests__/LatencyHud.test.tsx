import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LatencyHud } from "../LatencyHud";
import type { GenerationStats } from "../../hooks/generationReducer";

const stats: GenerationStats = {
  sent: 12,
  skipped: 4,
  rttMs: [500, 400, 450],
  modelMs: [320, 300, 310],
  resultTimes: [1_000, 1_500, 2_000, 2_500],
  lastError: null,
  lastEncodeMs: 3,
};

describe("LatencyHud", () => {
  it("shows rate, last/median timings, derived transport, and counters", () => {
    render(<LatencyHud stats={stats} />);

    expect(screen.getByText(/2\.0\/s/)).toBeInTheDocument();
    // round-trip: last 450, median 450
    expect(screen.getByText(/450ms · med 450ms/)).toBeInTheDocument();
    // model: last 310, median 310
    expect(screen.getByText(/310ms · med 310ms/)).toBeInTheDocument();
    // transport = last rtt − last model = 140
    expect(screen.getByText(/140ms/)).toBeInTheDocument();
    expect(screen.getByText(/3ms/)).toBeInTheDocument();
    expect(screen.getByText(/12 sent · 4 skipped/)).toBeInTheDocument();
  });

  it("shows placeholders before data and the sticky error when present", () => {
    render(
      <LatencyHud
        stats={{
          sent: 0,
          skipped: 0,
          rttMs: [],
          modelMs: [],
          resultTimes: [],
          lastError: { message: "fal token mint failed (403)", at: 5_000 },
          lastEncodeMs: null,
        }}
      />,
    );

    expect(
      screen.getByText(/fal token mint failed \(403\)/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });
});
