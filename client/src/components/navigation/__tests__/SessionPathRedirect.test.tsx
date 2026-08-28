import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import { SessionPathRedirect } from "../SessionPathRedirect";

// Regression: the legacy redirect shims used to render
// <Navigate to="/session/:sessionId" /> — React Router performs no param
// interpolation on the `to` string, so users landed in a session literally
// named ":sessionId".

function SessionProbe(): React.JSX.Element {
  const { sessionId } = useParams();
  return <div>session:{sessionId}</div>;
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/session/:sessionId" element={<SessionProbe />} />
        <Route
          path="/session/:sessionId/studio"
          element={<SessionPathRedirect />}
        />
        <Route
          path="/session/:sessionId/create"
          element={<SessionPathRedirect />}
        />
        <Route
          path="/session/:sessionId/continuity"
          element={<SessionPathRedirect />}
        />
        <Route
          path="/continuity/:sessionId"
          element={<SessionPathRedirect />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SessionPathRedirect", () => {
  it.each([
    "/session/abc123/studio",
    "/session/abc123/create",
    "/session/abc123/continuity",
    "/continuity/abc123",
  ])(
    "redirects %s to the real session id, not a literal :sessionId",
    (path) => {
      renderAt(path);
      expect(screen.getByText("session:abc123")).toBeInTheDocument();
    },
  );

  it("falls back to home when the param is missing", () => {
    render(
      <MemoryRouter initialEntries={["/orphan"]}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/orphan" element={<SessionPathRedirect />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});
