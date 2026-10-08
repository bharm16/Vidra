import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import authEye from "@/assets/design-system/auth-eye.svg";

export const AUTH_INPUT_CLASS =
  "h-12 rounded-md border-[0.5px] border-border-strong bg-input px-3 text-ui font-normal";

interface AuthPasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
}

export function AuthPasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  disabled,
  autoComplete,
  placeholder,
}: AuthPasswordFieldProps): React.ReactElement {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-ui font-normal">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          className={`${AUTH_INPUT_CLASS} pr-12`}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button
          type="button"
          onClick={onToggle}
          variant="ghost"
          size="icon-lg"
          className="absolute right-0 top-0 rounded-md"
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          <img src={authEye} alt="" />
        </Button>
      </div>
    </div>
  );
}

// Native copy paints at 703:301951/301967/301970 are opaque white,
// despite their secondary-text aliases resolving to 70 percent white.
export function AuthEmailAlternative(): React.ReactElement {
  return (
    <div className="flex h-5 items-center gap-3 text-ui font-normal text-foreground">
      <span className="h-px flex-1 bg-border" />
      <span className="w-4 text-center">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function AuthLegalLinks(): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 text-center text-ui font-normal">
      <p className="text-foreground">By continuing, you agree to our</p>
      <div className="flex items-center justify-center gap-4">
        <Link to="/terms-of-service" className="hover:underline">
          Terms
        </Link>
        <span className="text-foreground">and</span>
        <Link to="/privacy-policy" className="hover:underline">
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
