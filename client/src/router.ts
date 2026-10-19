import { createBrowserRouter } from "react-router-dom";
import { AppNavigation } from "./App";

/** A data router lets unsafe workspace drafts also block browser Back/Forward. */
export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter([{ path: "*", Component: AppNavigation }]);
}
