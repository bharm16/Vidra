import React from "react";
import { Toaster } from "@promptstudio/system/toaster";
import { useToast as useShadcnToast } from "@promptstudio/system/use-toast";

export interface ToastProviderProps {
  children: React.ReactNode;
}

type ToastContextValue = {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
};

const withDuration = (duration?: number): { duration?: number } =>
  typeof duration === "number" ? { duration } : {};

export const useToast = (): ToastContextValue => {
  const { toast } = useShadcnToast();

  return React.useMemo(
    () => ({
      success: (message: string, duration?: number) =>
        toast({ description: message, ...withDuration(duration) }),
      error: (message: string, duration?: number) =>
        toast({
          description: message,
          variant: "destructive",
          ...withDuration(duration),
        }),
      warning: (message: string, duration?: number) =>
        toast({ description: message, ...withDuration(duration) }),
      info: (message: string, duration?: number) =>
        toast({ description: message, ...withDuration(duration) }),
    }),
    [toast],
  );
};

export function ToastProvider({
  children,
}: ToastProviderProps): React.ReactElement {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
