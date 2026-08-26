import * as React from "react";

import { cn } from "@promptstudio/system/lib/utils";
import { useFieldError } from "@promptstudio/system/hooks/use-field-error";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  error?: boolean;
  errorMessage?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, errorMessage, ...props }, ref) => {
    const { invalidProps, errorClassName, errorNode } = useFieldError({
      id: props.id,
      name: props.name,
      error,
      errorMessage,
    });
    return (
      <div className="gap-ps-1 flex flex-col">
        <textarea
          className={cn(
            "min-h-ps-11 border-border bg-surface-1 px-ps-3 py-ps-2 text-body text-foreground placeholder:text-faint placeholder:text-label-sm focus-visible:border-border-strong flex w-full rounded-lg border placeholder:font-medium disabled:cursor-not-allowed disabled:opacity-50",
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
Textarea.displayName = "Textarea";

export { Textarea };
