import * as React from "react";

import { cn } from "@promptstudio/system/lib/utils";
import { useFieldError } from "@promptstudio/system/hooks/use-field-error";

export interface InputProps extends React.ComponentProps<"input"> {
  error?: boolean;
  errorMessage?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, errorMessage, ...props }, ref) => {
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
            "h-ps-8 border-border bg-surface-1 px-ps-3 py-ps-2 text-body text-foreground file:text-body-sm file:text-foreground placeholder:text-faint placeholder:text-label-sm focus-visible:border-border-strong flex w-full rounded-sm border shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] file:border-0 file:bg-transparent file:font-medium placeholder:font-medium disabled:cursor-not-allowed disabled:opacity-50",
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
