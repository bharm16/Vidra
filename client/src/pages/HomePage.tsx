import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";

/**
 * Gallery landing (see CONTEXT.md). Zero-content state: the one-screen
 * manifesto — wordmark, the product one-liner, one line of subcopy, and a
 * single auth-aware CTA. The gallery grows here as dogfooding produces
 * clips (ADR-0008, design-overhaul decision 6).
 */
export function HomePage(): ReactElement {
  const user = useAuthUser();

  return (
    <div className="bg-app flex h-full flex-col overflow-y-auto">
      <main className="m-auto w-full max-w-md px-4 py-16 text-center sm:px-6">
        <p className="text-overline text-faint">Vidra</p>
        <h1 className="text-heading-18 text-foreground mt-2">
          From one-line idea to one good clip.
        </h1>
        <p className="text-body-sm text-muted mt-2">
          Describe what you're imagining. Vidra expands it into a cinematic
          first frame, then brings it to life as an AI video clip.
        </p>
        <div className="mt-5 flex justify-center">
          <Button asChild className="rounded-full">
            {user ? (
              <Link to="/">Open workspace</Link>
            ) : (
              <Link to="/signin">Sign in</Link>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
