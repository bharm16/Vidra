import * as React from "react";

import { cn } from "@promptstudio/system/lib/utils";
import { useFieldError } from "@promptstudio/system/hooks/use-field-error";

export interface InputProps extends React.ComponentProps<"input"> {
  error?: boolean;
  errorMessage?: string;
  density?: "default" | "dense";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, type, error, errorMessage, density = "default", ...props },
    ref,
  ) => {
    const { invalidProps, errorClassName, errorNode } = useFieldError({
      id: props.id,
      name: props.name,
      error,
      errorMessage,
    });
    return (
      <div className="gap-ps-1 flex flex-col">
        <input
          type={type}
          className={cn(
            "flex w-full border-hairline border-border-strong bg-input px-3 py-2 text-ui font-normal text-foreground placeholder:text-muted file:border-0 file:bg-transparent file:text-ui focus-visible:!outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50",
            density === "dense" ? "h-8 rounded-sm" : "h-10 rounded-md",
            errorClassName,
            className,
          )}
          ref={ref}
          {...invalidProps}
          {...props}
        />
        {errorNode}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
