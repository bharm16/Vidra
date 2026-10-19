import { afterEach, expect, it } from "vitest";
import { hasUnconfirmedVideoEdits } from "../hooks/useVideoEditor";

const change = JSON.stringify({ editId: "edit_a", revision: 1, operationId: "operation_a", command: { kind: "remove", itemId: "item_a" } });
afterEach(() => { localStorage.clear(); });

it("finds an owner's unconfirmed save in any project while no editor is open", () => {
  localStorage.setItem("vidra.video-editor.v1:creator:project_two:edit:edit_a:change", change);
  expect(hasUnconfirmedVideoEdits("creator")).toBe(true);
});

it("ignores another account whose id shares the prefix, and unrelated or unreadable rows", () => {
  localStorage.setItem(`vidra.video-editor.v1:${encodeURIComponent("creator:x")}:project_one:edit:edit_a:change`, change);
  localStorage.setItem("vidra.video-editor.v1:creator2:project_one:edit:edit_a:change", change);
  localStorage.setItem("vidra.video-editor.v1:creator:project_one:edit:edit_a:change", "not json");
  localStorage.setItem("vidra.video-editor.v1:creator:project_one:selected", change);
  expect(hasUnconfirmedVideoEdits("creator")).toBe(false);
});
