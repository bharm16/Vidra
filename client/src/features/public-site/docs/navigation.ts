export interface DocNavigationArticle { slug: string; title: string; description: string; mobileDescription?: string; group: "Start" | "Create" | "Your work" | "Troubleshooting"; label: string }

/** Small reading/navigation metadata remains available when article or search code cannot load. */
export const DOC_NAV_ARTICLES: DocNavigationArticle[] = [
  {
    "slug": "start",
    "label": "Get started",
    "group": "Start",
    "title": "Get started",
    "description": "Choose what you want to make. You can begin with words, an image, a sketch, or footage you already have."
  },
  {
    "slug": "images",
    "label": "Images",
    "group": "Create",
    "title": "Create and edit images",
    "description": "Make a new image from words, or create a new version of an image you choose."
  },
  {
    "slug": "regions",
    "label": "Edit an area",
    "group": "Create",
    "title": "Select an area to edit",
    "description": "Mark the part of an exact image version that you want the next edit to address."
  },
  {
    "slug": "sketch",
    "label": "Sketch",
    "group": "Create",
    "title": "Draw with Sketch",
    "description": "Use a drawing and a description to explore a live image, then save the exact preview you choose."
  },
  {
    "slug": "video",
    "label": "Video clips",
    "group": "Create",
    "title": "Generate a video clip",
    "description": "Start with a description or animate an image. Review motion, duration and sound before submitting."
  },
  {
    "slug": "editor",
    "label": "Video editor",
    "group": "Create",
    "title": "Assemble and export a video",
    "description": "Arrange exact media versions into a cut, add captions and audio, then export one saved revision."
  },
  {
    "slug": "words",
    "label": "Improve words",
    "group": "Create",
    "title": "Improve words without generating media",
    "description": "Ask a question or try a different wording direction while keeping control of your draft."
  },
  {
    "slug": "models",
    "label": "Models and settings",
    "group": "Create",
    "title": "Choose models and settings",
    "description": "Choose a supported action and model, then review the settings that will be sent with the request.",
    "mobileDescription": "Choose a supported action and model, then review the settings that will be captured with the request."
  },
  {
    "slug": "imports",
    "label": "Imports",
    "group": "Your work",
    "title": "Import and organize media",
    "description": "Add files to a project, inspect their versions, and choose explicitly when to use them."
  },
  {
    "slug": "history",
    "label": "History and drafts",
    "group": "Your work",
    "title": "Conversations, drafts and versions",
    "description": "Keep several edits in progress without losing the requests and results that came before them."
  },
  {
    "slug": "sharing",
    "label": "Sharing",
    "group": "Your work",
    "title": "Share and download your work",
    "description": "Share one exact media version or exported file, and keep file transfer separate from generation and rendering."
  },
  {
    "slug": "recovery",
    "label": "Recovery",
    "group": "Troubleshooting",
    "title": "Recover interrupted work",
    "description": "Return to your conversation to check a request or find its available results."
  },
  {
    "slug": "allowance",
    "label": "Allowance",
    "group": "Troubleshooting",
    "title": "Understand your testing allowance",
    "description": ""
  }
];

export const DOC_GROUPS = ["Start", "Create", "Your work", "Troubleshooting"] as const;
export function findNavigationArticle(slug: string): DocNavigationArticle | undefined { return DOC_NAV_ARTICLES.find(item => item.slug === (slug === "get-started" ? "start" : slug)); }
