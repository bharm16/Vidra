import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@promptstudio/system/components/ui/dropdown-menu";
import downIcon from "@/assets/design-system/composer-down.svg";

interface VideoModelSelectProps {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (modelId: string) => void;
  icon?: React.ReactNode;
}

/** Page 21 model setting. Dormant recommendation/showroom controls are retired. */
export function VideoModelSelect({
  options,
  value,
  onChange,
  icon,
}: VideoModelSelectProps): React.ReactElement {
  const label = options.find((option) => option.id === value)?.label ?? "Model";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="vidra-setting vidra-setting--model"
        aria-label="Video model"
      >
        {icon}
        {label}
        <span className="vidra-composer-icon">
          <img src={downIcon} alt="" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
