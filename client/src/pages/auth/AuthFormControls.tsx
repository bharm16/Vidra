import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";

export const AUTH_INPUT_CLASS = "vf-field";

export function AuthFieldError({ id, children }: { id?: string; children: ReactNode }): ReactElement {
  return <div id={id} className="vf-auth-error" role="alert"><img src="/design-assets/auth-field-alert.svg" alt="" />{children}</div>;
}

export function AuthNotice({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" }): ReactElement {
  return <div className="vf-auth-notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}><span className="vf-auth-notice-icon" aria-hidden="true"><img src={tone === "error" ? "/design-assets/fidelity-auth-alert.svg" : "/design-assets/fidelity-auth-success.svg"} alt="" /></span><span>{children}</span></div>;
}

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
  labelAside?: ReactNode;
  error?: string | undefined;
}

export function AuthPasswordField({ id, label, value, onChange, visible, onToggle, disabled, autoComplete, placeholder, labelAside, error }: AuthPasswordFieldProps): ReactElement {
  return <div className="vf-auth-field"><div className="vf-auth-label"><label htmlFor={id}>{label}</label>{labelAside}</div><div className="vf-auth-password"><input id={id} className={AUTH_INPUT_CLASS} type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} placeholder={placeholder} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /><Button variant="ghost" type="button" onClick={onToggle} disabled={disabled} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>{visible ? "Hide" : "Show"}</Button></div>{error ? <AuthFieldError id={`${id}-error`}>{error}</AuthFieldError> : null}</div>;
}

export function AuthEmailAlternative(): ReactElement { return <div className="vf-auth-email-alternative"><span /><span>or</span><span /></div>; }
export function AuthLegalLinks(): ReactElement { return <p className="vf-auth-consent">By continuing, you agree to the <Link to="/terms-of-service">Terms of service</Link> and <Link to="/privacy-policy">Privacy policy</Link>.</p>; }
