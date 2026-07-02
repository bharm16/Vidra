import * as React from "react";

import { cn } from "@promptstudio/system/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  error?: boolean;
  errorMessage?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, errorMessage, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-ps-1">
        <input
          type={type}
          className={cn(
            "flex h-ps-8 w-full rounded-sm border border-border bg-surface-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] px-ps-3 py-ps-2 text-body text-foreground file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-foreground placeholder:text-faint placeholder:text-label-sm placeholder:font-medium focus-visible:border-border-strong disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-danger focus-visible:border-danger",
            className,
          )}
          ref={ref}
          aria-invalid={error || undefined}
          aria-describedby={
            error && errorMessage
              ? `${props.id ?? props.name}-error`
              : undefined
          }
          {...props}
        />
        {error && errorMessage ? (
          <p
            id={`${props.id ?? props.name}-error`}
            className="text-label-sm text-danger"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
