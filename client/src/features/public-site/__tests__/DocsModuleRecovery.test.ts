import { afterEach, describe, expect, it } from "vitest";
import { clearDocsRecovery, readDocsRecovery } from "../docs/moduleRecovery";

const initialUrl = window.location.href;
const initialState: unknown = window.history.state;
afterEach(() => { window.history.replaceState(initialState, "", initialUrl); });

describe("Docs module recovery history", () => {
  it("restores only a matching public route and removes only its own metadata", () => {
    const caller = { idx: 4, key: "caller", usr: { topic: "editor" } };
    const recovery = { route: "/docs/editor?q=export", searchOpen: true, scrollTop: 25, windowScrollY: 400 };
    window.history.replaceState({ ...caller, vidraDocsModuleRecovery: recovery }, "", recovery.route);
    expect(readDocsRecovery()).toEqual(recovery);
    clearDocsRecovery();
    expect(window.history.state).toEqual(caller);
    expect(window.location.pathname + window.location.search).toBe(recovery.route);
    expect(readDocsRecovery()).toBeUndefined();
  });

  it("rejects another route and malformed saved positions", () => {
    window.history.replaceState({ vidraDocsModuleRecovery: { route: "/docs/other", searchOpen: true, scrollTop: 0, windowScrollY: 0 } }, "", "/docs?q=export");
    expect(readDocsRecovery()).toBeUndefined();
    window.history.replaceState({ vidraDocsModuleRecovery: { route: "/docs?q=export", searchOpen: true, scrollTop: -1, windowScrollY: "400" } }, "");
    expect(readDocsRecovery()).toBeUndefined();
  });
});
