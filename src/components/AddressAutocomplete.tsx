import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { suggestAddresses } from "@/lib/routing.functions";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function AddressAutocomplete({ label, value, onChange, placeholder }: Props) {
  const run = useServerFn(suggestAddresses);
  const [items, setItems] = useState<Array<{ label: string }>>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const lastQueryRef = useRef("");

  // Close when clicking outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced fetch
  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || q === lastQueryRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      try {
        const res = await run({ data: { q } });
        setItems(res.suggestions);
        setHighlight(0);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, run]);

  const select = (s: string) => {
    onChange(s);
    setOpen(false);
    lastQueryRef.current = s;
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(items[highlight].label);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <label className="block rounded-2xl bg-card border border-border/60 px-4 py-3 shadow-soft focus-within:border-primary/60 transition">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          autoComplete="off"
          className="block w-full bg-transparent outline-none text-base mt-0.5 placeholder:text-muted-foreground/50"
        />
      </label>
      {open && (items.length > 0 || loading) && (
        <div className="absolute z-30 left-0 right-0 mt-2 rounded-2xl bg-card border border-border shadow-lg overflow-hidden">
          {loading && items.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Recherche…</div>
          )}
          <ul role="listbox" className="max-h-64 overflow-auto">
            {items.map((it, i) => (
              <li key={`${it.label}-${i}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(it.label)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition ${
                    i === highlight ? "bg-secondary" : "hover:bg-secondary/60"
                  }`}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
