import {
  maxLengthOptions,
  maxTotalOptions,
  type MaxLength,
  type MaxTotalSec,
  type Preferences,
} from "@/lib/preferences";

interface Props {
  prefs: Preferences;
  onChange: (p: Preferences) => void;
}

export function PreferencesPanel({ prefs, onChange }: Props) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-4 shadow-soft space-y-5">
      <div>
        <div className="text-sm font-medium">Préférences de confort</div>
        <p className="text-xs text-muted-foreground mt-1">
          Your Way respectera ces limites pour te proposer uniquement des
          trajets qui te conviennent. Enregistrées uniquement sur cet appareil.
        </p>
      </div>

      <Group label="Longueur maximale d'un tunnel">
        <Pills
          options={maxLengthOptions}
          value={prefs.maxTunnelLengthM}
          onChange={(v) => onChange({ ...prefs, maxTunnelLengthM: v as MaxLength })}
        />
      </Group>

      <Group label="Temps total passé en tunnel">
        <Pills
          options={maxTotalOptions}
          value={prefs.maxTotalTunnelSec}
          onChange={(v) =>
            onChange({ ...prefs, maxTotalTunnelSec: v as MaxTotalSec })
          }
        />
      </Group>

      <Toggle
        label="Éviter les tunnels fermés si possible"
        hint="Your Way préférera les passages couverts ou ouverts."
        checked={prefs.avoidClosed}
        onChange={(v) => onChange({ ...prefs, avoidClosed: v })}
      />

      <Toggle
        label="Privilégier un trajet sans tunnel, même un peu plus long"
        hint="Le trajet sans tunnel sera mis en avant quand il existe."
        checked={prefs.preferTunnelFree}
        onChange={(v) => onChange({ ...prefs, preferTunnelFree: v })}
      />
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-foreground/80 mb-2">{label}</div>
      {children}
    </div>
  );
}

function Pills<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-secondary"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full border transition ${
          checked ? "bg-primary border-primary" : "bg-background border-border"
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-card shadow transition ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="text-xs">
        <span className="block font-medium text-foreground">{label}</span>
        {hint && <span className="block text-muted-foreground mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
