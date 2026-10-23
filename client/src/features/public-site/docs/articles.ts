import { DOC_NAV_ARTICLES, type DocNavigationArticle } from "./navigation";
export { DOC_GROUPS } from "./navigation";

export interface DocSection { id: string; title: string; body: string; mobileTitle?: string; mobileBody?: string }
export interface DocArticle extends DocNavigationArticle { sections: DocSection[] }

/** Article bodies stay bundled locally and load independently of navigation. */
const DOC_SECTIONS: Record<string, DocSection[]> = {
  "start": [
    {
      "id": "choose-an-action",
      "title": "Choose an action",
      "body": "Choose Video, Image, Voiceover or Music beside Make; switching keeps your words and your place. Upscale, Reframe and Captions sit on the rail. Every result has its own buttons, such as Animate, Edit or Add to video. You can also import media or open Sketch."
    },
    {
      "id": "review-before-you-generate",
      "title": "Review before you generate",
      "body": "Write your direction and check the chosen action, exact inputs, model, settings and destination. A missing input or unavailable setting needs attention before the request can run."
    },
    {
      "id": "keep-working",
      "title": "Keep working",
      "body": "Once a request starts, it keeps its own setup. Start another draft or continue an eligible image follow-up while it runs. A finished result never sends that draft for you.",
      "mobileBody": "Once accepted, the request keeps its own setup. Start another draft or continue an eligible image follow-up while it runs. A completed result does not submit that draft for you."
    },
    {
      "id": "keep-the-result",
      "title": "Keep the result",
      "body": "Open a ready result to inspect it. Download it, share that version, or explicitly use it in another request or video edit."
    }
  ],
  "images": [
    {
      "id": "make-a-new-image",
      "title": "Make a new image",
      "body": "Choose Make image, write a description, and review the model, shape and number of images. Generate when the draft is saved and ready."
    },
    {
      "id": "edit-an-exact-version",
      "title": "Edit an exact version",
      "body": "Choose Edit under the image you want. That exact version joins your request and your words stay. Write what should change. The original stays available in version history."
    },
    {
      "id": "work-while-it-runs",
      "title": "Work while it runs",
      "body": "For an eligible single-image request, a follow-up can wait for that exact result. Write ahead if you want. The result fills its waiting input; you still choose when to generate."
    },
    {
      "id": "choose-from-a-batch",
      "title": "Choose from a batch",
      "body": "When a request returns several images, choose a specific ready image as the next input. A preferred or latest label never silently replaces an input already chosen."
    }
  ],
  "regions": [
    {
      "id": "choose-the-source-image",
      "title": "Choose the source image",
      "body": "Open an image version, then choose Edit a region. The selection belongs to that image and its current dimensions and transform."
    },
    {
      "id": "paint-the-area",
      "title": "Paint the area",
      "body": "Use the brush and eraser to refine the shaded area. Check the selection before choosing Use selection."
    },
    {
      "id": "describe-the-change",
      "title": "Describe the change",
      "body": "The image and its selection appear in the draft as separate explicit roles. Write the change you want and review the selected model. Area generation is unavailable for the current models."
    },
    {
      "id": "recheck-after-a-source-change",
      "title": "Recheck after a source change",
      "body": "Changing the base image or crop can invalidate the selection. Review or redraw it before generating; an old selection must not silently move to different pixels."
    }
  ],
  "sketch": [
    {
      "id": "start-with-the-canvas",
      "title": "Start with the canvas",
      "body": "Draw, place shapes or add a reference image. Add words to describe the direction you want. Entering Sketch does not automatically start a live preview."
    },
    {
      "id": "control-the-preview",
      "title": "Control the preview",
      "body": "Choose Start preview when ready. Pause when you want to stop live work. Returning to Sketch restores it paused, so opening the page does not quietly resume generation."
    },
    {
      "id": "keep-the-last-useful-image",
      "title": "Keep the last useful image",
      "body": "If a preview fails, the last successful image remains visible. Reaching the testing limit stops new preview work but still lets you accept the displayed image."
    },
    {
      "id": "accept-then-choose-its-use",
      "title": "Accept, then choose its use",
      "body": "Save image saves the picture currently displayed. A later preview cannot replace that choice. After it is saved, decide separately whether to use it as an input or in a video edit."
    }
  ],
  "video": [
    {
      "id": "choose-your-starting-point",
      "title": "Choose your starting point",
      "body": "Make video starts from words. Attach a picture and it becomes the start frame; attach a clip to edit or extend it. What you attach decides which models fit, and models that cannot use it are greyed out."
    },
    {
      "id": "describe-the-shot",
      "title": "Describe the shot",
      "body": "Describe the subject, action, scene and camera movement. Check the supported duration, shape, audio setting and number of outputs. Unavailable choices remain visible until you resolve them."
    },
    {
      "id": "follow-the-request",
      "title": "Follow the request",
      "body": "Once a video starts, it keeps the setup you sent. Sending a video opens a new empty draft. Closing the viewer or starting other work doesn’t add the finished clip to that draft.",
      "mobileBody": "The accepted request keeps its captured setup. A video submission opens a separate empty draft. Closing the viewer or starting other work does not turn a completed clip into that draft’s input."
    },
    {
      "id": "use-the-clip",
      "title": "Use the clip",
      "body": "Open a ready clip to play it. Download or share that version, or choose Add to video. Playback problems and generation failures have separate recovery actions."
    }
  ],
  "editor": [
    {
      "id": "add-your-media",
      "title": "Add your media",
      "body": "Open an empty video edit and choose the clips or images you want. Review the exact version before adding it. New still images start at three seconds; you can change that duration."
    },
    {
      "id": "shape-the-timing",
      "title": "Shape the timing",
      "body": "Trim and reorder the visual track. Captions and source audio stay attached to their clip. If a shorter clip leaves timing outside its bounds, repair it before exporting."
    },
    {
      "id": "add-text-and-audio",
      "title": "Add text and audio",
      "body": "Add manual captions to a clip, or bring in captions made with the Captions tool, and position them inside the frame. A voiceover has its own lane and music another, both anchored to video time and played over the clip sound. Copy audio keeps the original clip audio; muting is a separate choice."
    },
    {
      "id": "export-a-saved-cut",
      "title": "Export a saved cut",
      "body": "Review the saved revision and export settings. The export captures that revision, so you can keep editing. Closing its panel leaves progress and the ready file reachable from the editor."
    }
  ],
  "words": [
    {
      "id": "choose-the-words-to-work-on",
      "title": "Choose the words to work on",
      "body": "Select a phrase for alternatives or ask for help with the draft. The current words stay in place while a suggestion is prepared."
    },
    {
      "id": "review-the-suggestion",
      "title": "Review the suggestion",
      "body": "Read the proposed change before applying it. Suggestions are tied to the draft and context that produced them."
    },
    {
      "id": "apply-it-deliberately",
      "title": "Apply it deliberately",
      "body": "Choose the suggestion you want to use. A replacement applies to that exact target in the current draft. If the phrase changed or no longer resolves, select it again."
    },
    {
      "id": "generate-when-ready",
      "title": "Generate when ready",
      "body": "Changing words is undoable and does not generate media. Check the inputs and settings, then submit the draft explicitly."
    }
  ],
  "models": [
    {
      "id": "choose-the-action-first",
      "title": "Choose the output first",
      "body": "Models are filtered by the output or tool you choose and by the inputs you attach; a model that cannot use them is greyed out. Auto picks a model that fits when you choose Make. No model or input is inferred from an unrelated image that happens to be open."
    },
    {
      "id": "resolve-incompatible-choices",
      "title": "Resolve incompatible choices",
      "body": "Changing a model can make an input, shape, duration or audio option unavailable. Review the affected choices before generating. The app does not quietly discard an input to make the request fit."
    },
    {
      "id": "know-what-is-saved",
      "title": "Know what is saved",
      "body": "Each request keeps the model, settings, inputs and instructions it started with, so an older request always shows what was used.",
      "mobileBody": "Each accepted request keeps its model, settings, inputs and instruction context. An old request remains a record of what was used at that time."
    },
    {
      "id": "revisit-old-work-carefully",
      "title": "Revisit old work carefully",
      "body": "A model from an earlier request may no longer be available. Reuse setup keeps that fact visible. Choose a current supported model and review any changed settings before submitting again."
    }
  ],
  "imports": [
    {
      "id": "choose-a-file",
      "title": "Choose a file",
      "body": "Import an image, clip or audio file from your device. Vidra checks the actual file before it becomes a usable input. A familiar filename extension does not guarantee that its contents are supported."
    },
    {
      "id": "let-the-upload-finish",
      "title": "Let the upload finish",
      "body": "Closing the import panel leaves the upload visible in the library. If the browser no longer has the file bytes, choose the same file again rather than assuming an empty retry can recover them.",
      "mobileBody": "Closing the import panel leaves the upload visible in the library. If the browser no longer has the file bytes, choose the file again rather than assuming an empty retry can recover them."
    },
    {
      "id": "use-it-when-you-are-ready",
      "title": "Use it when you are ready",
      "body": "A saved import joins project media. Use as input creates or updates an explicit draft role; Add to video adds the selected version to a cut. Saving the file alone does neither."
    },
    {
      "id": "organize-without-changing-history",
      "title": "Organize without changing history",
      "body": "Filter or sort Media to find a version. Hide removes it from the normal grid; Show hidden lets you restore it. A copy in another project is independent."
    }
  ],
  "history": [
    {
      "id": "a-conversation-records-accepted-work",
      "title": "A conversation records accepted work",
      "body": "Requests, answers and results stay in chronological history. Revising an earlier request creates another request; it does not erase the messages or outputs that followed the original."
    },
    {
      "id": "a-draft-is-unfinished-work",
      "title": "A draft is unfinished work",
      "body": "Return to unfinished work through its conversation history, or start another request while work runs. Starting a new edit preserves your existing words."
    },
    {
      "id": "a-version-identifies-a-result",
      "title": "A version identifies a result",
      "body": "A media version is one image, clip or file. Looking at another version changes the viewer. Use it explicitly to change a draft input. Reuse setup copies the original request’s captured inputs and settings."
    },
    {
      "id": "resume-from-conversation-history",
      "title": "Resume from conversation history",
      "body": "Open a past conversation to resume its unfinished work. Requests and results remain in that conversation, so you can return to them without a separate drafts list."
    }
  ],
  "sharing": [
    {
      "id": "create-a-link",
      "title": "Create a link",
      "body": "Open the version or export you want to share and create a link. The link is pinned to that saved item. Editing later or preferring another version does not replace the shared content."
    },
    {
      "id": "check-an-uncertain-result",
      "title": "Check an uncertain result",
      "body": "If your connection drops while you create or turn off a link, use Check status. The link shows as unconfirmed until Vidra finishes the change.",
      "mobileBody": "If the response is lost while a link is being created or revoked, use Check status. The UI keeps the outcome unconfirmed until the server resolves it."
    },
    {
      "id": "turn-access-off",
      "title": "Turn access off",
      "body": "Turn off the link to revoke public access. A confirmed revoked link shows an unavailable public page. Restoring a trashed project does not automatically republish its links."
    },
    {
      "id": "download-the-file",
      "title": "Download the file",
      "body": "Download starts a file transfer. The browser or operating system handles where it is saved. A transfer starting is not proof that the file reached your disk."
    }
  ],
  "recovery": [
    {
      "id": "not-sure-it-was-sent",
      "title": "Not sure it was sent?",
      "body": "Use Check status. Your request keeps its original inputs and settings while Vidra confirms the result. Don’t send a second request just to see whether the first one started.",
      "mobileBody": "Use Check status. The accepted request keeps its original inputs and settings while the app reconciles the result. Do not create a second request just to find out whether the first was accepted.",
      "mobileTitle": "Lost the submission response?"
    },
    {
      "id": "find-a-completed-result",
      "title": "Find a completed result",
      "body": "Open the request in its conversation to find the available result. Use the media toolbar to download the stored file."
    },
    {
      "id": "working-offline-or-in-several-tabs",
      "title": "Working offline or in several tabs",
      "body": "You can keep drafting offline when this device has a copy. Reconnecting doesn’t send it for you. If two copies conflict, both are kept, and an older save never replaces newer words.",
      "mobileBody": "You can keep drafting offline when a local copy is available. Reconnecting does not automatically submit it. Conflicts preserve both copies, and an older save response cannot mark newer words saved."
    },
    {
      "id": "still-needs-attention",
      "title": "Still needs attention",
      "body": "If a request stays unresolved, contact support from the workspace. Sign in to the correct account to reopen private work."
    }
  ],
  "allowance": [
    {
      "id": "review-availability-before-you-run",
      "title": "Review availability before you run",
      "body": "Vidra checks available models, supported settings and testing limits before a request starts.",
      "mobileBody": "Available models, supported settings and testing limits are checked before a request is accepted. Free intake does not reserve paid credits."
    },
    {
      "id": "when-a-limit-is-reached",
      "title": "When a limit is reached",
      "body": "Generation may be unavailable. Your saved media, editing and downloads remain accessible. Opening another draft does not create more allowance."
    },
    {
      "id": "find-request-progress",
      "title": "Find request progress",
      "body": "Open the request in conversation history to see its progress and available results."
    }
  ]
};

export const DOC_ARTICLES: DocArticle[] = DOC_NAV_ARTICLES.map(item => ({ ...item, sections: DOC_SECTIONS[item.slug] ?? [] }));

export function findArticle(slug: string): DocArticle | undefined { return DOC_ARTICLES.find(item => item.slug === (slug === "get-started" ? "start" : slug)); }
export function searchArticles(query: string): DocArticle[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const keywords: Record<string, string> = { recovery: "export interrupted upload retry reconnect", imports: "same file upload resume" };
  const score = (item: DocArticle): number => terms.reduce((total, term) => total + (item.title.toLocaleLowerCase().includes(term) ? 4 : (keywords[item.slug] ?? "").includes(term) ? 2 : 1), 0);
  return DOC_ARTICLES.filter(item => {
    const text = [item.title, item.description, keywords[item.slug] ?? "", ...item.sections.flatMap(section => [section.title, section.body])].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  }).sort((left, right) => score(right) - score(left));
}
