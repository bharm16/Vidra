import React, { createContext, useContext, type ReactNode } from "react";
import type {
  OptionalToolSidebarAssetsDomain,
  OptionalToolSidebarGenerationDomain,
  OptionalToolSidebarPromptInteractionDomain,
  OptionalToolSidebarSessionsDomain,
} from "../types";

export interface SidebarDataContextValue {
  sessions: OptionalToolSidebarSessionsDomain;
  promptInteraction: OptionalToolSidebarPromptInteractionDomain;
  generation: OptionalToolSidebarGenerationDomain;
  assets: OptionalToolSidebarAssetsDomain;
}

const SidebarDataContext = createContext<SidebarDataContextValue | null>(null);

export function useSidebarData(): SidebarDataContextValue | null {
  return useContext(SidebarDataContext);
}

export function useSidebarSessionsDomain(): OptionalToolSidebarSessionsDomain {
  return useContext(SidebarDataContext)?.sessions ?? null;
}

export function useSidebarPromptInteractionDomain(): OptionalToolSidebarPromptInteractionDomain {
  return useContext(SidebarDataContext)?.promptInteraction ?? null;
}

export function useSidebarGenerationDomain(): OptionalToolSidebarGenerationDomain {
  return useContext(SidebarDataContext)?.generation ?? null;
}

export function useSidebarAssetsDomain(): OptionalToolSidebarAssetsDomain {
  return useContext(SidebarDataContext)?.assets ?? null;
}

export function SidebarDataContextProvider({
  value,
  children,
}: {
  value: SidebarDataContextValue | null;
  children: ReactNode;
}): React.ReactElement {
  return (
    <SidebarDataContext.Provider value={value}>
      {children}
    </SidebarDataContext.Provider>
  );
}
