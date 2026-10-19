import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImportControl } from "../components/ImportControl";
import type { ImportJob, ProjectImportsController } from "../hooks/useProjectImports";

it("dismisses an import without cancelling it and reopens the same job before explicit cancellation", async () => {
  const cancel = vi.fn(async () => true);
  const imports: ProjectImportsController = { jobs: [{ id: "import_current", filename: "desk.png", state: "uploading", progress: 42 }], warning: undefined, choose: vi.fn(), retry: vi.fn(), cancel, forgetRejected: vi.fn() };
  function Harness(): React.ReactElement {
    const [selected, setSelected] = useState<string | undefined>("import_current");
    return <><button onClick={() => setSelected("import_current")}>Reopen current import</button><ImportControl imports={imports} selectedId={selected} onSelect={setSelected} /></>;
  }
  render(<Harness />);
  expect(screen.getByRole("progressbar", { name: "Upload progress" })).toHaveValue(42);
  fireEvent.click(screen.getByRole("button", { name: "Close import panel" }));
  await waitFor(() => expect(screen.queryByRole("progressbar", { name: "Upload progress" })).not.toBeInTheDocument());
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reopen current import" }));
  expect(await screen.findByRole("progressbar", { name: "Upload progress" })).toHaveValue(42);
  fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
  await waitFor(() => expect(cancel).toHaveBeenCalledExactlyOnceWith("import_current"));
});

it("binds the panel to the newly started job when another upload is already pending", async () => {
  let release: (() => void) | undefined;
  const started = new Promise<void>(resolve => { release = resolve; });
  function Harness(): React.ReactElement {
    const [jobs, setJobs] = useState<ImportJob[]>([{ id: "import_old", filename: "old.png", state: "uploading", progress: 20 }]);
    const [selected, setSelected] = useState<string>();
    const imports: ProjectImportsController = { jobs, warning: undefined, choose: async (_file, _resume, onStarted) => { await started; setJobs(previous => [...previous, { id: "import_new", filename: "new.png", state: "uploading", progress: 42 }]); onStarted?.("import_new"); }, retry: vi.fn(), cancel: vi.fn(), forgetRejected: vi.fn() };
    return <ImportControl imports={imports} selectedId={selected} onSelect={setSelected} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Choose media file"), { target: { files: [new File(["picture"], "new.png", { type: "image/png" })] } });
  expect(screen.queryByText("Uploading · 20%")).not.toBeInTheDocument();
  await act(async () => { release?.(); });
  expect(await screen.findByRole("progressbar", { name: "Upload progress" })).toHaveValue(42);
});
