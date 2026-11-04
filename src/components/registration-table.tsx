"use client";

import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { adminDeleteRegistration, adminUpdateRegistration } from "@/app/actions/registrations";

type Part = "tennis" | "padel" | "eats";
type SortKey = "name" | Part;

export interface TableRegistration {
  id: string;
  member_id: string;
  full_name: string;
  // ["T 15p/30p", "P P300"], or empty.
  rankings: string[];
  is_me: boolean;
  tennis: boolean;
  padel: boolean;
  eats: boolean;
  // Position in order of registration per part (1 is first), when registered.
  order: { tennis: number | null; padel: number | null; eats: number | null };
  // Place on the reserve list, when there.
  reserve: { tennis: number | null; padel: number | null };
  // Only filled in for organisers.
  registered_by_name: string | null;
}

export interface TablePart {
  part: Part;
  label: string;
  // "12/16", "8"
  count: string;
}

// Everyone registered for an event in one table: sortable by name or per
// part (in order of registration), with a search on name. Organisers also
// get a pencil to change the parts and a bin to remove the registration;
// both ask to confirm.
export function RegistrationTable({
  eventId,
  registrations,
  parts,
  manage = false,
}: {
  eventId: string;
  registrations: TableRegistration[];
  parts: TablePart[];
  manage?: boolean;
}) {
  const [editing, setEditing] = useState<TableRegistration | null>(null);
  const [deleting, setDeleting] = useState<TableRegistration | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });

  const query = filter.trim().toLowerCase();
  const shown = registrations
    .filter((r) => r.full_name.toLowerCase().includes(query))
    .sort((a, b) => {
      const byName = a.full_name.localeCompare(b.full_name, "nl");
      if (sort.key === "name") return sort.desc ? -byName : byName;
      // Registered for the part first, in order of registration; the rest
      // after, by name. Descending only flips the registered ones.
      const oa = a.order[sort.key];
      const ob = b.order[sort.key];
      if (oa === null || ob === null) return oa === ob ? byName : oa === null ? 1 : -1;
      return sort.desc ? ob - oa : oa - ob;
    });

  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }));

  const header = (key: SortKey, label: ReactNode, sub?: string, align = "text-center") => {
    const active = sort.key === key;
    return (
      <th
        className={`py-2 font-medium ${key === "name" ? "pr-2 text-left" : `px-1 ${align}`}`}
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          onClick={() => sortBy(key)}
          className={`inline-flex items-center gap-0.5 rounded hover:text-club-700 ${
            active ? "text-club-800" : ""
          }`}
        >
          <span className="text-left">
            {label}
            {sub && <span className="block whitespace-nowrap text-[11px] font-normal text-stone-400">{sub}</span>}
          </span>
          <span aria-hidden className={`text-[10px] ${active ? "" : "text-stone-300"}`}>
            {active ? (sort.desc ? "▼" : "▲") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div>
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Zoek op naam"
        aria-label="Zoek op naam"
        className="mb-3 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base focus:border-club-600 focus:outline-none focus:ring-2 focus:ring-club-200"
      />

      {notice && (
        <p role="status" className="mb-3 rounded-lg bg-club-50 p-3 text-sm text-club-900">
          {notice}
        </p>
      )}

      {registrations.length === 0 ? (
        <p className="text-sm text-stone-600">Nog niemand ingeschreven.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 align-bottom text-xs text-stone-500">
                {header("name", "Naam")}
                {parts.map((p) => (
                  <Fragment key={p.part}>{header(p.part, p.label, p.count)}</Fragment>
                ))}
                {manage && (
                  <th className="py-2 pl-2">
                    <span className="sr-only">Acties</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {shown.map((r) => (
                <tr key={r.id} className={r.is_me ? "bg-club-50" : undefined}>
                  <td className="py-2 pr-2">
                    <span className={`text-stone-900 ${r.is_me ? "font-semibold" : "font-medium"}`}>
                      {r.full_name}
                    </span>
                    {r.rankings.length > 0 && (
                      <span className="block text-xs text-stone-500">
                        {r.rankings.map((text, i) => (
                          <span key={text} className="whitespace-nowrap">
                            {i > 0 && " · "}
                            {text}
                          </span>
                        ))}
                      </span>
                    )}
                    {manage && r.registered_by_name && (
                      <span className="block text-xs text-stone-500">
                        door {r.registered_by_name}
                      </span>
                    )}
                  </td>
                  {parts.map((p) => (
                    <td key={p.part} className="px-1 py-2 text-center">
                      <PartStatus registration={r} part={p.part} />
                    </td>
                  ))}
                  {manage && (
                    <td className="py-2 pl-2">
                      <div className="flex flex-col items-end sm:flex-row sm:justify-end">
                        <IconButton
                          label={`Inschrijving van ${r.full_name} aanpassen`}
                          onClick={() => {
                            setNotice(null);
                            setEditing(r);
                          }}
                        >
                          <PencilIcon />
                        </IconButton>
                        <IconButton
                          label={`Inschrijving van ${r.full_name} verwijderen`}
                          danger
                          onClick={() => {
                            setNotice(null);
                            setDeleting(r);
                          }}
                        >
                          <BinIcon />
                        </IconButton>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={parts.length + 2} className="py-3 text-stone-600">
                    Niemand gevonden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditDialog
          eventId={eventId}
          registration={editing}
          parts={parts}
          onClose={(message) => {
            setEditing(null);
            if (message) setNotice(message);
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          eventId={eventId}
          registration={deleting}
          onClose={(message) => {
            setDeleting(null);
            if (message) setNotice(message);
          }}
        />
      )}
    </div>
  );
}

function PartStatus({ registration: r, part }: { registration: TableRegistration; part: Part }) {
  if (!r[part]) return <span className="text-stone-300" aria-label="nee">–</span>;
  const reserve = part === "eats" ? null : r.reserve[part];
  if (reserve !== null)
    return (
      <span
        title={`Reservelijst, plaats ${reserve}`}
        className="inline-flex whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
      >
        res. {reserve}
      </span>
    );
  return (
    <span className="text-club-700" aria-label="ja">
      ✓
    </span>
  );
}

// A modal built on <dialog>: focus stays inside, Escape closes it.
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop closes the dialog.
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-stone-200 bg-white p-0 shadow-xl backdrop:bg-stone-900/40"
    >
      <div className="p-5">
        <h2 className="mb-3 text-lg font-semibold text-stone-900">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

const BUTTON =
  "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60";

function EditDialog({
  eventId,
  registration: r,
  parts,
  onClose,
}: {
  eventId: string;
  registration: TableRegistration;
  parts: TablePart[];
  onClose: (message?: string) => void;
}) {
  const [choice, setChoice] = useState({ tennis: r.tennis, padel: r.padel, eats: r.eats });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changes = parts
    .filter((p) => choice[p.part] !== r[p.part])
    .map((p) => ({ label: p.label, on: choice[p.part], part: p.part }));
  const nothingLeft = !choice.tennis && !choice.padel && !choice.eats;
  const rejoins = changes.filter((c) => c.on && c.part !== "eats");

  const save = () =>
    startTransition(async () => {
      const result = await adminUpdateRegistration({
        eventId,
        memberId: r.member_id,
        ...choice,
      });
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      } else onClose(`Inschrijving van ${r.full_name} aangepast.`);
    });

  return (
    <Modal title={`Inschrijving van ${r.full_name}`} onClose={() => onClose()}>
      {!confirming ? (
        <>
          <div className="space-y-2">
            {parts.map((p) => (
              <label
                key={p.part}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 p-3 has-checked:border-club-600 has-checked:bg-club-50"
              >
                <input
                  type="checkbox"
                  checked={choice[p.part]}
                  onChange={(e) => setChoice({ ...choice, [p.part]: e.target.checked })}
                  className="size-5 shrink-0 accent-club-700"
                />
                <span className="font-medium text-stone-900">{p.label}</span>
                {p.part !== "eats" && r[p.part] && r.reserve[p.part] !== null && (
                  <span className="ml-auto text-xs text-amber-800">
                    reserve {r.reserve[p.part]}
                  </span>
                )}
              </label>
            ))}
          </div>
          {nothingLeft && (
            <p className="mt-3 text-sm text-red-700">
              Vink minstens één onderdeel aan. Wil je de inschrijving helemaal schrappen, gebruik
              dan het vuilbakje.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              className={`${BUTTON} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}
            >
              Annuleren
            </button>
            <button
              type="button"
              disabled={changes.length === 0 || nothingLeft}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
              className={`${BUTTON} bg-club-700 text-white hover:bg-club-800`}
            >
              Opslaan
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-stone-700">Ben je zeker dat je dit wil wijzigen?</p>
          <ul className="mt-2 space-y-1 text-sm">
            {changes.map((c) => (
              <li key={c.label} className={c.on ? "text-club-800" : "text-red-700"}>
                {c.on ? "+ inschrijven voor" : "− uitschrijven voor"} {c.label.toLowerCase()}
              </li>
            ))}
          </ul>
          {rejoins.length > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              Wie opnieuw ingeschreven wordt voor een sport, sluit achteraan aan. Is die sport
              volzet of zijn de inschrijvingen afgesloten, dan komt {r.full_name} op de reservelijst.
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className={`${BUTTON} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}
            >
              Terug
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              autoFocus
              className={`${BUTTON} bg-club-700 text-white hover:bg-club-800`}
            >
              {pending ? "Even geduld…" : "Ja, wijzigen"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function DeleteDialog({
  eventId,
  registration: r,
  onClose,
}: {
  eventId: string;
  registration: TableRegistration;
  onClose: (message?: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await adminDeleteRegistration({ eventId, registrationId: r.id });
      if (result.error) setError(result.error);
      else onClose(`Inschrijving van ${r.full_name} verwijderd.`);
    });

  return (
    <Modal title="Inschrijving verwijderen?" onClose={() => onClose()}>
      <p className="text-sm text-stone-700">
        De volledige inschrijving van <strong>{r.full_name}</strong> wordt geschrapt, voor alle
        onderdelen. Wie op de reservelijst staat, schuift door. Dit kan niet ongedaan gemaakt
        worden.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onClose()}
          autoFocus
          className={`${BUTTON} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}
        >
          Annuleren
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className={`${BUTTON} bg-red-700 text-white hover:bg-red-800`}
        >
          {pending ? "Even geduld…" : "Ja, verwijderen"}
        </button>
      </div>
    </Modal>
  );
}

function IconButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex size-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 ${
        danger ? "hover:text-red-700" : "hover:text-club-700"
      }`}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5" aria-hidden>
      <path d="M13.6 3.6a1.8 1.8 0 0 1 2.6 2.6L7 15.4l-3.5.9.9-3.5 9.2-9.2Z" strokeLinejoin="round" />
    </svg>
  );
}

function BinIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5" aria-hidden>
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.6a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L15 5.5M8.5 8.5v5.5M11.5 8.5v5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
