"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { inputClass } from "@/components/ui";

export interface MemberOption {
  id: string;
  // What the field shows once the member is picked.
  label: string;
  first_name: string;
  last_name: string;
  // Extra text next to the name in the list, such as "ingeschreven".
  hint?: string;
}

// Lowercase and without accents, so "e" finds "é" and "Ç" finds "c".
const normalise = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// How well a member matches what was typed: lower is better, null is no match.
// Every typed word has to match the start of a word in the first name or
// family name ("jan pe" finds Jan Peeters, "pee" finds him too), or else
// appear somewhere in the name ("vanden" finds "Van den Broeck").
function score(option: MemberOption, query: string): number | null {
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const first = normalise(option.first_name);
  const last = normalise(option.last_name);
  const nameWords = `${first} ${last}`.split(/[\s'-]+/).filter(Boolean);
  const compact = `${first}${last}`.replace(/[\s'-]+/g, "");
  let result = 0;
  for (const word of words) {
    if (nameWords.some((w) => w.startsWith(word))) continue;
    if (compact.includes(word.replace(/[\s'-]+/g, ""))) {
      result = 2;
      continue;
    }
    return null;
  }
  // Names that start with what was typed come first.
  const whole = words.join(" ");
  if (result === 0 && !(last.startsWith(whole) || first.startsWith(whole))) result = 1;
  return result;
}

// A text field that finds a member as you type, on first name or family name,
// instead of one long dropdown. The chosen member's id is sent as `name`.
export function MemberPicker({
  name,
  options,
  value: controlled,
  onChange: notify,
  required = false,
  placeholder = "Typ een voornaam of familienaam…",
  label,
  className = "",
}: {
  name: string;
  options: MemberOption[];
  // The chosen member's id, or "" for none. Leave out to let the field keep it.
  value?: string;
  onChange?: (id: string) => void;
  required?: boolean;
  placeholder?: string;
  // Accessible name, when there is no visible label around the field.
  label?: string;
  className?: string;
}) {
  const listId = useId();
  const [own, setOwn] = useState("");
  const value = controlled ?? own;
  const onChange = (id: string) => {
    setOwn(id);
    notify?.(id);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.id === value) ?? null;
  // What is typed; null while the field just shows the chosen member.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const text = typed ?? selected?.label ?? "";
  const query = normalise(typed ?? "");
  const matches = useMemo(
    () =>
      options
        .map((o, i) => ({ o, i, s: score(o, query) }))
        .filter((m): m is { o: MemberOption; i: number; s: number } => m.s !== null)
        .sort((a, b) => a.s - b.s || a.i - b.i)
        .map((m) => m.o),
    [options, query],
  );

  // A typed name that was not picked from the list does not count.
  const invalid = typed !== null && typed.trim() !== "" && !selected;
  useEffect(() => {
    inputRef.current?.setCustomValidity(invalid ? "Kies een lid uit de lijst." : "");
  }, [invalid]);

  const pick = (option: MemberOption) => {
    onChange(option.id);
    setTyped(null);
    setOpen(false);
  };

  const move = (to: number) => {
    const next = Math.max(0, Math.min(matches.length - 1, to));
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className={`relative ${className}`}>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        required={required}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setTyped(e.target.value);
          if (value) onChange("");
          setActive(0);
          setOpen(true);
        }}
        onFocus={(e) => {
          e.target.select();
          setActive(0);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else move(active + 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(active - 1);
          } else if (e.key === "Enter" && open) {
            // Pick the highlighted member instead of sending the form.
            e.preventDefault();
            if (matches[active]) pick(matches[active]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        className={inputClass}
      />
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 text-base font-normal shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-stone-500">Geen lid gevonden.</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keep the focus in the field, so the list does not close first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseMove={() => setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-2 px-3 py-2 text-stone-900 ${
                  i === active ? "bg-club-50" : ""
                } ${o.id === value ? "font-semibold" : ""}`}
              >
                <span>{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-stone-500">{o.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
