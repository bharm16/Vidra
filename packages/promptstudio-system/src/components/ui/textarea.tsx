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
            "flex min-h-[200px] w-full rounded-card border-0 bg-[var(--vidra-message-surface)] p-4 text-body font-normal text-foreground ring-[0.5px] ring-inset ring-white placeholder:font-normal placeholder:text-foreground focus-visible:!outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50",
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
