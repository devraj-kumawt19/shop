import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordField({ label = "Password", name = "password", error, ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="sa-field"><label htmlFor={`sa-${name}`}>{label}</label><span className="sa-password"><input {...props} id={`sa-${name}`} name={name} type={visible ? "text" : "password"} aria-invalid={Boolean(error)} aria-describedby={error ? `sa-${name}-error` : undefined} /><button type="button" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{error && <small id={`sa-${name}-error`} className="sa-field-error">{error}</small>}</div>;
}
