import { useEffect, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { DocsPage } from "../docs/DocsPage";
import { DOC_ARTICLES, findArticle, searchArticles } from "../docs/articles";
import { DEFAULT_DOCS_DEPENDENCIES } from "../docs/useDocsModules";
import { SystemRoutePage } from "../SystemPage";
import { ContactSupportPage } from "@/pages/ContactSupportPage";
import { supportDraft, supportDraftSchema, supportTopic } from "../support";
import { SiteShell } from "../SiteShell";
import { PricingPage } from "../PublicPages";

const { openDraft } = vi.hoisted(() => ({ openDraft: vi.fn<(url: string) => void>() }));
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: (options: { onChange?: (user: null) => void }): null => { const { onChange } = options; useEffect(() => { onChange?.(null); }, [onChange]); return null; } }));
vi.mock("../support", async importOriginal => ({ ...await importOriginal<typeof import("../support")>(), openSupportDraft: openDraft }));

function Location(): ReactElement { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
async function renderDocs(path = "/docs"): Promise<void> {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/docs/*" element={<DocsPage />} /></Routes><Location /></MemoryRouter>);
  const slug = new URL(path, "http://localhost").pathname.slice("/docs/".length);
  const title = path === "/docs" ? "Make the most of Vidra." : findArticle(slug)?.title ?? "We could not find that page";
  await screen.findByRole("heading", { name: title, level: 1 });
}

describe("public Docs journeys", () => {
  it("renders all active topics and uses independent creation starting points", async () => {
    await renderDocs("/docs/start");
    const topics = screen.getByRole("navigation", { name: "Documentation topics" });
    for (const article of DOC_ARTICLES) expect(within(topics).getByRole("link", { name: article.label })).toHaveAttribute("href", `/docs/${article.slug}`);
    expect(screen.getByText(/Each is a starting point in its own right/)).toBeVisible();
    expect(screen.queryByText(/Type an idea, shape it into a picture/)).not.toBeInTheDocument();
  });

  it("searches bundled articles, retains its query on navigation, and focuses contents headings", async () => {
    await renderDocs();
    fireEvent.click(screen.getByRole("button", { name: /Search documentation/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search documentation" }), { target: { value: "export" } });
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("link", { name: "Assemble and export a video" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/docs/editor?q=export");
    expect(screen.getByRole("heading", { name: "Assemble and export a video", level: 1 })).toBeVisible();
    const links = screen.getAllByRole("link", { name: "Shape the timing" });
    const contentsLink = links[0];
    if (!contentsLink) throw new Error("Missing contents link");
    fireEvent.click(contentsLink);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Shape the timing" })).toHaveFocus());
  });

  it("preserves a no-match query until clear and restores focus on close", async () => {
    await renderDocs();
    const trigger = screen.getByRole("button", { name: /Search documentation/ });
    trigger.focus(); fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("textbox", { name: "Search documentation" }), { target: { value: "zxq-no-such-article" } });
    expect(await screen.findByText("No matching articles.")).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("q=zxq-no-such-article");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("textbox", { name: "Search documentation" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("does not silently replace a missing article with a different guide", async () => {
    await renderDocs("/docs/does-not-exist?q=imports");
    expect(screen.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
    expect(screen.getByTestId("location")).toHaveTextContent("/docs/does-not-exist?q=imports");
  });

  it("opens mobile topic navigation and the keyboard search shortcut", async () => {
    await renderDocs("/docs/history");
    fireEvent.click(screen.getByRole("button", { name: "Docs menu" }));
    expect(screen.getByRole("dialog", { name: "Documentation" })).toBeVisible();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Imports" }));
    expect(screen.getByRole("heading", { level: 1, name: "Import and organize media" })).toBeVisible();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog", { name: "Search documentation" })).toBeVisible();
  });

  it("matches complete multiword queries and includes article body text", () => {
    expect(searchArticles("same file").map(article => article.slug)).toContain("imports");
    expect(searchArticles("  ")).toEqual([]);
    expect(searchArticles("export nonexistentword")).toEqual([]);
    expect(searchArticles("export").slice(0, 3).map(article => article.slug)).toEqual(["editor", "recovery", "sharing"]);
  });

  it("opens the contents sheet and focuses the chosen section after closing", async () => {
    await renderDocs("/docs/editor");
    fireEvent.click(screen.getByRole("button", { name: "On this page" }));
    const sheet = screen.getByRole("dialog", { name: "On this page" });
    fireEvent.click(within(sheet).getByRole("link", { name: "Shape the timing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Shape the timing" })).toHaveFocus();
  });

  it("keeps navigation and the route when the content module fails, then retries that dependency", async () => {
    const body = await import("../docs/DocsBody");
    const loadContent = vi.fn<typeof DEFAULT_DOCS_DEPENDENCIES.loadContent>().mockRejectedValueOnce(new Error("Content chunk unavailable")).mockResolvedValue(body);
    render(<MemoryRouter initialEntries={["/docs/start?q=export"]}><DocsPage dependencies={{ loadContent, loadSearch: DEFAULT_DOCS_DEPENDENCIES.loadSearch }} /><Location /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "This page could not load" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Documentation topics" })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/docs/start?q=export");
    expect(screen.queryByRole("heading", { name: "Get started", level: 1 })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Get started", level: 1 })).toBeVisible();
    expect(loadContent).toHaveBeenCalledTimes(2);
  });

  it("keeps the calling article and search query when its module fails and retries without navigating", async () => {
    const index = await import("../docs/searchIndex");
    const loadSearch = vi.fn<typeof DEFAULT_DOCS_DEPENDENCIES.loadSearch>().mockRejectedValueOnce(new Error("Search chunk unavailable")).mockResolvedValue(index);
    render(<MemoryRouter initialEntries={["/docs/editor?q=export"]}><DocsPage dependencies={{ loadContent: DEFAULT_DOCS_DEPENDENCIES.loadContent, loadSearch }} /><Location /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Assemble and export a video", level: 1 });
    fireEvent.click(screen.getByRole("button", { name: /Search documentation/ }));
    expect(await screen.findByText("Search is unavailable right now.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Search documentation" })).toHaveValue("export");
    expect(screen.getByRole("heading", { name: "Assemble and export a video", hidden: true })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/docs/editor?q=export");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Try again" }));
    expect(await within(screen.getByRole("dialog")).findByRole("link", { name: "Assemble and export a video" })).toBeVisible();
    expect(loadSearch).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("location")).toHaveTextContent("/docs/editor?q=export");
  });
});

describe("support handoff and data boundaries", () => {
  it("blocks invalid email and missing message without preparing a handoff", () => {
    openDraft.mockClear();
    render(<MemoryRouter><ContactSupportPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Your email (optional)"), { target: { value: "bad-address" } });
    fireEvent.submit(screen.getByRole("form", { name: "Contact support form" }));
    expect(openDraft).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid email address, or leave it blank.")).toBeVisible();
    expect(screen.getByLabelText("Your email (optional)")).toHaveFocus();
    expect(supportDraftSchema.safeParse({ email: "", message: "" }).success).toBe(false);
  });

  it("preserves data-request details and only prepares an email", () => {
    openDraft.mockClear();
    render(<MemoryRouter initialEntries={["/contact?topic=deletion"]}><ContactSupportPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please help me delete my account." } });
    fireEvent.submit(screen.getByRole("form", { name: "Contact support form" }));
    expect(openDraft).toHaveBeenCalledTimes(1);
    const preparedUrl = openDraft.mock.calls[0]?.[0];
    if (!preparedUrl) throw new Error("Expected prepared email URL");
    const url = new URL(preparedUrl);
    expect(url.searchParams.get("subject")).toBe("Account deletion request");
    expect(screen.getByRole("dialog")).toHaveTextContent("Vidra has not sent a support message.");
    fireEvent.click(screen.getByRole("button", { name: "My email app did not open" }));
    expect(screen.getByLabelText("Support email address")).toHaveValue("support@vidra.app");
    fireEvent.click(screen.getByRole("button", { name: "Back to support" }));
    expect(screen.getByLabelText("Message")).toHaveValue("Please help me delete my account.");
  });

  it("encodes user-entered headers as body text and rejects unknown topics", () => {
    const draft = supportDraft("security", "person@example.com", "&subject=replace\nBcc: stranger@example.com");
    expect(new URL(draft.url).searchParams.get("subject")).toBe("Security report");
    expect(new URL(draft.url).searchParams.get("body")).toContain("&subject=replace\nBcc: stranger@example.com");
    expect(supportTopic("unknown")).toBe("support");
  });
});

describe("public navigation and system recovery", () => {
  it("closes the public sheet when choosing the current page and restores the menu trigger", async () => {
    render(<MemoryRouter initialEntries={["/docs"]}><SiteShell><p>Public content</p></SiteShell></MemoryRouter>);
    const trigger = screen.getByRole("button", { name: "Menu" });
    trigger.focus(); fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Explore Vidra" })).getByRole("link", { name: "Documentation" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
  it("keeps the free-testing deep link and expands all pricing questions together", () => {
    render(<MemoryRouter><SiteShell><PricingPage /></SiteShell></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /What happens when I reach the limit/ }));
    expect(screen.getByText(/Your available allowance and the action’s limits are checked/)).toBeVisible();
    expect(screen.getByText(/Generation pauses. You can still open, edit and download saved media/)).toBeVisible();
    expect(screen.queryByRole("link", { name: /Buy|Subscribe/ })).not.toBeInTheDocument();
  });
  it("does not expose retired Pricing navigation", async () => {
    render(<MemoryRouter><SiteShell><p>Public content</p></SiteShell></MemoryRouter>);
    await screen.findByRole("link", { name: "Sign in" });
    expect(screen.queryByRole("link", { name: "Pricing" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start creating" })).toHaveAttribute("href", "/signup?redirect=%2Fapp");
  });
  it("retries the current failure without creating new work", () => {
    const retry = vi.fn();
    render(<MemoryRouter><SystemRoutePage state="offline" onRetry={retry} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "You are offline" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
