"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cva, type VariantProps } from "class-variance-authority";
import { CaretDown, CaretUp, Check } from "./icons";

import { cn } from "@promptstudio/system/lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const selectTriggerVariants = cva(
  "flex w-full items-center border bg-surface-1 text-foreground transition-colors data-[placeholder]:text-faint focus-visible:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
  {
    variants: {
      size: {
        xxs: "h-ps-6 gap-ps-1 px-ps-4 text-label-10 rounded-md [&>svg]:size-3",
        xs: "h-ps-6 gap-ps-1 px-ps-2 text-label-11 rounded-md [&>svg]:size-3",
        sm: "h-ps-6 gap-ps-1 px-ps-2 text-label-12 rounded-lg [&>svg]:size-3.5",
        default: "h-ps-6 gap-ps-2 px-ps-3 py-ps-2 text-body rounded-lg",
        md: "h-ps-6 gap-ps-2 px-ps-3 py-ps-2 text-body rounded-lg",
        lg: "h-ps-9 gap-ps-2 px-ps-4 py-ps-2 text-body-lg rounded-lg",
      },
      align: {
        between: "justify-between",
        center: "relative justify-center",
      },
      variant: {
        default: "border-border hover:border-border-strong",
        filled:
          "border-border bg-surface-2 text-muted data-[placeholder]:text-muted hover:border-border-strong hover:bg-surface-3",
        ghost:
          "border-transparent bg-transparent hover:bg-surface-2 hover:border-border",
        pill: "border-border bg-surface-2 rounded-full hover:border-border-strong hover:bg-surface-3",
        accent:
          "border-accent bg-accent text-app font-semibold ps-glow-accent data-[placeholder]:text-app/90 hover:opacity-90 focus-visible:border-accent",
        error: "border-danger hover:border-danger focus-visible:border-danger",
      },
    },
    defaultVariants: {
      size: "default",
      align: "between",
      variant: "default",
    },
  },
);

const selectItemVariants = cva(
  "relative flex w-full cursor-pointer select-none items-center outline-none transition-colors duration-base data-[highlighted]:bg-surface-2 data-[highlighted]:text-foreground data-[state=checked]:bg-surface-2 data-[state=checked]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  {
    variants: {
      size: {
        xxs: "min-h-ps-8 rounded px-ps-3 py-ps-1 text-label-sm",
        xs: "min-h-ps-9 rounded px-ps-3 py-ps-1 text-label-sm",
        sm: "min-h-ps-9 rounded-md px-ps-3 py-ps-1 text-label",
        default: "min-h-ps-10 rounded-md px-ps-3 py-ps-2 text-body",
        md: "min-h-ps-10 rounded-md px-ps-3 py-ps-2 text-body",
        lg: "min-h-ps-10 rounded-md px-ps-3 py-ps-2 text-body-lg",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

// Context to pass size down to SelectItem
type SelectContextValue = {
  size?: "xxs" | "xs" | "sm" | "default" | "md" | "lg";
};
const SelectContext = React.createContext<SelectContextValue>({});

export interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectTriggerVariants> {}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, size, align, variant, ...props }, ref) => (
  <SelectContext.Provider value={{ size: size ?? "default" }}>
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(selectTriggerVariants({ size, align, variant }), className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <CaretDown
          className={cn(
            "opacity-50",
            align === "center"
              ? cn(
                  "absolute top-1/2 -translate-y-1/2",
                  size === "xxs" || size === "xs" ? "right-ps-1" : "right-ps-2",
                )
              : "shrink-0",
          )}
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  </SelectContext.Provider>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "py-ps-1 flex cursor-default items-center justify-center",
      className,
    )}
    {...props}
  >
    <CaretUp size={16} />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "py-ps-1 flex cursor-default items-center justify-center",
      className,
    )}
    {...props}
  >
    <CaretDown size={16} />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "bg-popover text-popover-foreground shadow-elevated data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-dropdown max-h-[--radix-select-content-available-height] min-w-[8rem] origin-[--radix-select-content-transform-origin] overflow-y-auto overflow-x-hidden rounded-lg border-0",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-ps-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      "px-ps-3 py-ps-2 text-label-sm font-semibold text-ghost",
      className,
    )}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

export interface SelectItemProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>,
    VariantProps<typeof selectItemVariants> {}

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ className, children, size: sizeProp, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  const size = sizeProp ?? context.size ?? "default";
  const iconSize = size === "xxs" || size === "xs" || size === "sm" ? 12 : 16;

  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(selectItemVariants({ size }), className)}
      {...props}
    >
      <span className="flex items-center gap-ps-2">
        <span className="flex size-icon-sm items-center justify-center">
          <SelectPrimitive.ItemIndicator>
            <Check size={iconSize} />
          </SelectPrimitive.ItemIndicator>
        </span>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </span>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-ps-1 my-ps-1 h-px bg-surface-2", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  selectTriggerVariants,
  selectItemVariants,
};
