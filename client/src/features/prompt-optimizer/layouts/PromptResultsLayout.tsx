import React from "react";
import { PromptCanvas } from "../PromptCanvas";

export const PromptResultsLayout = (): React.ReactElement => (
  <main
    id="main-content"
    className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black"
  >
    <PromptCanvas />
  </main>
);
