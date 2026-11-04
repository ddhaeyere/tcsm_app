"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

// A controlled select for an account's role. React resets uncontrolled form
// fields after a server action, and an uncontrolled <select> then jumps back
// to its first option ("Lid"), even when the role was saved. Keeping the value
// in state keeps the choice on screen.
export function RoleSelect({
  role,
  label,
  className = "",
}: {
  role: "member" | "admin";
  label?: string;
  className?: string;
}) {
  const [value, setValue] = useState(role);
  return (
    <select
      name="role"
      value={value}
      onChange={(e) => setValue(e.target.value as "member" | "admin")}
      aria-label={label}
      className={`${inputClass} ${className}`}
    >
      <option value="member">Lid</option>
      <option value="admin">Beheerder</option>
    </select>
  );
}
