import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { analyzeRoute } from "@/lib/routing.functions";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RouteCard } from "@/components/RouteCard";
import { TunnelCard } from "@/components/TunnelCard";
import { RouteMap } from "@/components/RouteMap";
import { RouteTimeline } from "@/components/RouteTimeline";
import { ComfortBadge } from "@/components/ComfortBadge";
import { Mascot } from "@/components/Mascot";
import { Glossary } from "@/components/Glossary";
import { AuthBar } from "@/components/AuthBar";
import {
  comfortBlurb,
  formatDistance,
  formatDuration,
  formatShortTime,
  reassuranceMessages,
  type AnalyzedRoute,
} from "@/lib/tunnels";
import { googleMapsUrl, wazeUrl } from "@/lib/exports";
import { verificationCopy } from "@/lib/verificationCopy";
import {
  routePassesStrict,
  usePreferences,
  maxLengthLabel,
  maxTotalLabel,
  type Preferences,
} from "@/lib/preferences";

const searchSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const Route = createFileRoute("/analyze")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [{ title: "Analyse de l'itinéraire — Your Way" }],
  }),
  component: Analyze,
});

const confidenceCopy = {
  high: "Confiance élevée : les données de tunnel sont détaillées pour cet itinéraire.",
  medium: "Confiance moyenne : certaines données de tunnel peuvent être incomplètes sur les longs trajets.",
  low: "Confiance limitée : les données de tunnel sont peu nombreuses pour cet itinéraire.",
} as const;

function Analyze() {
  const { from, to } = Route.useSearch();
  const run = useServerFn(analyzeRoute);
  const [prefs] = usePreferences();

  const { data, isLoading, error } = useQuery({
    queryKey: ["analyze", from, to, JSON.stringify(prefs)],
    queryFn: () => run({ data: { from, to, prefs } }),
    staleTime: 60_000,
  });

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const minDisplayDurationMs = 4000;
  const [showPreAnalysisSupport, setShowPreAnalysisSupport] = useState(false);
  const [reassuranceStartedAt, setReassuranceStartedAt] = useState<number | null>(null);
  const dismissedPreSupportRef = useRef(false);

  useEffect(() => {
    if (isLoading && reassuranceStartedAt === null && !dismissedPreSupportRef.current) {
      setReassuranceStartedAt(Date.now());
      setShowPreAnalysisSupport(true);
      return;
    }
    if (!isLoading && reassuranceStartedAt !== null && showPreAnalysisSupport) {
      const elapsed = Date.now() - reassuranceStartedAt;
      const remaining = Math.max(0, minDisplayDurationMs - elapsed);
      const t = setTimeout(() => {
        setShowPreAnalysisSupport(false);
        setReassuranceStartedAt(null);
      }, remaining);
      return () => clearTimeout(t);
    }
  }, [isLoading, reassuranceStartedAt, showPreAnalysisSupport]);

  const handleDismissPreSupport = (open: boolean) => {
    if (!open) {
      dismissedPreSupportRef.current = true;
      setShowPreAnalysisSupport(false);
      setReassuranceStartedAt(null);
    }
  };

  return (
    <main className="min-h-screen w-full">
      <div className="mx-auto max-w-md px-5 pt-6 pb-20">
        <AuthBar />
        <Link to="/" className="mt-2 inline-block text-sm text-muted-foreground hover:text-foreground">
          ← Nouvelle recherche
        </Link>

        <header className="mt-4 mb-6">
          <div className="text-xs uppercase tracking-wider text-primary/80 mb-1">
            Analyse de l'itinéraire
          </div>
          <h1 className="text-2xl leading-snug">
            {from} <span className="text-muted-foreground">→</span> {to}
          </h1>
        </header>
        <Dialog open={showPreAnalysisSupport} onOpenChange={handleDismissPreSupport}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-3xl border border-primary/25 bg-[#fffaf5] text-slate-900 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg text-slate-900">Bien joué pour ce trajet</DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-relaxed text-slate-800">
                Je suis très fier de toi !<br />
                On va regarder ce trajet ensemble tranquillement, je suis avec toi ❤️
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>

        {isLoading && <LoadingState />}
        {error && <ErrorBlock message={(error as Error).message} />}
        {data && ("error" in data ? (
          <ErrorBlock message={data.error ?? "Erreur inconnue"} />
        ) : (
          <Results
            data={data}
            selectedIdx={selectedIdx ?? data.recommendedIndex ?? data.fallbackIndex ?? data.fastestIndex}
            onSelect={setSelectedIdx}
            prefs={prefs}
          />
        ))}
      </div>
    </main>
  );
}

interface ResultsData {
  from: { lat: number; lng: number; label: string };
  to: { lat: number; lng: number; label: string };
  routes: AnalyzedRoute[];
  recommendedIndex: number | null;
  fallbackIndex: number | null;
  fastestIndex: number;
  tunnelFreeIndex: number | null;
  tunnelFreeAvailable: boolean;
  tunnelFreeStrict: boolean;
  compliantMask: boolean[];
  anyCompliant: boolean;
  debug?: {
    routingAttempts: number;
    detourAttempts: number;
    customModelUsed: boolean;
    tunnelFreeCandidates: number;
    noTunnelFreeReason: string | null;
    strictNoTunnelsRequested: boolean;
  };
}

type EmotionalLabel =
  | "Très apaisant"
  | "Apaisant"
  | "Confortable"
  | "Demande un peu d’attention"
  | "Zone sensible";


function Results({
  data,
  selectedIdx,
  onSelect,
  prefs,
}: {
  data: ResultsData;
  selectedIdx: number;
  onSelect: (i: number) => void;
  prefs: Preferences;
}) {
  const route = data.routes[selectedIdx];
  const meets = data.compliantMask[selectedIdx] ?? routePassesStrict(route, prefs);
  const [focusTunnel, setFocusTunnel] = useState<number | null>(null);
  const tunnelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hasActivePrefs = prefsActive(prefs);
  const strictNoTunnel = prefs.maxTunnelLengthM === 0;
  const noTunnelFreeFound = strictNoTunnel && !data.anyCompliant;
  const [showNoTunnelFreeModal, setShowNoTunnelFreeModal] = useState(false);
  const [showUncertainModal, setShowUncertainModal] = useState(false);
  const [showPanicSupport, setShowPanicSupport] = useState(false);
  const modalShownKey = useRef<string | null>(null);
  const uncertainShownKey = useRef<string | null>(null);
  const routeIsUncertainTunnelFree =
    route.tunnels.length === 0 && route.certainty !== "high";
  useEffect(() => {
    const key = `${data.from.label}→${data.to.label}`;
    if (noTunnelFreeFound && modalShownKey.current !== key) {
      modalShownKey.current = key;
      setShowNoTunnelFreeModal(true);
    }
  }, [noTunnelFreeFound, data.from.label, data.to.label]);
  useEffect(() => {
    const key = `${data.from.label}→${data.to.label}→${selectedIdx}`;
    if (
      routeIsUncertainTunnelFree &&
      !noTunnelFreeFound &&
      uncertainShownKey.current !== key
    ) {
      uncertainShownKey.current = key;
      setShowUncertainModal(true);
    }
  }, [routeIsUncertainTunnelFree, noTunnelFreeFound, data.from.label, data.to.label, selectedIdx]);
  const selectedIsRecommended = data.recommendedIndex !== null && selectedIdx === data.recommendedIndex;
  const selectedIsFallback = data.fallbackIndex !== null && selectedIdx === data.fallbackIndex;
  const selectedKicker = selectedIsRecommended
    ? "Respecte ta préférence de confort"
    : selectedIsFallback
      ? "Alternative la plus proche disponible"
      : "Sélectionné";
  const compliantEntries = data.routes
    .map((r, i) => ({ route: r, index: i }))
    .filter((entry) => !hasActivePrefs || data.compliantMask[entry.index]);
  const fallbackEntries = hasActivePrefs
    ? data.routes
        .map((r, i) => ({ route: r, index: i }))
        .filter((entry) => !data.compliantMask[entry.index])
    : [];

  const handleTunnelFocus = (i: number) => {
    setFocusTunnel(i);
    setTimeout(() => setFocusTunnel((cur) => (cur === i ? i : cur)), 0);
    tunnelRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const gmaps = googleMapsUrl(data.from.label, data.to.label);
  const waze = wazeUrl(data.to.lat, data.to.lng);

  const suppressReassurance = hasActivePrefs && !meets;
  const reassurances = suppressReassurance ? [] : reassuranceMessages(route);
  const emotional = emotionalScore(route);

  return (
    <div className="space-y-6">
      <NoTunnelFreeModal
        open={showNoTunnelFreeModal}
        onClose={() => setShowNoTunnelFreeModal(false)}
        onSeeAlternative={() => {
          if (data.fallbackIndex !== null) onSelect(data.fallbackIndex);
          setShowNoTunnelFreeModal(false);
        }}
        hasFallback={data.fallbackIndex !== null}
      />
      <UncertainRouteModal
        open={showUncertainModal}
        onClose={() => setShowUncertainModal(false)}
        certainty={route.certainty}
        reasons={route.certaintyReasons}
      />
      <section className="rounded-3xl bg-card border border-border/60 p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-primary font-semibold">
              {selectedKicker}
            </div>
            <div className="text-lg font-medium mt-0.5">{route.label}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {formatDistance(route.distanceM)} · {formatDuration(route.durationSec)}
            </div>
          </div>
          <ComfortBadge score={route.comfort} />
        </div>
        <div className="mt-3 rounded-2xl border border-border/50 bg-[var(--color-comfort-very)]/25 px-3 py-2">
          <div className="text-[11px] text-muted-foreground">Ressenti émotionnel estimé</div>
          <div className="text-lg font-semibold">{emotional.label}</div>
        </div>

        <p className="mt-4 text-sm leading-relaxed">
          {hasActivePrefs && !meets && prefs.maxTunnelLengthM === 0
            ? "Aucun trajet entièrement sans tunnel trouvé. Your Way a essayé d'éviter les tunnels en testant des alternatives et des détours, mais aucun itinéraire sans tunnel détecté n'a été trouvé avec les données disponibles."
            : hasActivePrefs && !meets
              ? "Ce trajet ne respecte pas entièrement tes préférences. Your Way a cherché des alternatives, mais aucun itinéraire pleinement compatible n'a été trouvé."
              : routeIntro(route)}{" "}
          {!data.tunnelFreeAvailable && route.tunnels.length > 0 && !hasActivePrefs && (
            <span className="text-muted-foreground">
              Aucun itinéraire plus confortable n'a été trouvé pour ce trajet. Celui-ci limite au maximum l'exposition aux tunnels.
            </span>
          )}
        </p>

        {reassurances.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {reassurances.map((m, i) => (
              <li
                key={i}
                className="text-sm text-foreground/80 flex gap-2 items-start"
              >
                <span className="mt-1.5 size-1.5 rounded-full bg-primary/70 shrink-0" />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Stat label="Tunnels détectés" value={String(route.tunnels.length)} />
          <Stat
            label="Distance totale en tunnel"
            value={route.totalTunnelM ? formatDistance(route.totalTunnelM) : "—"}
          />
          <Stat
            label="Tunnel le plus long"
            value={route.longestTunnelM ? formatDistance(route.longestTunnelM) : "—"}
          />
          <Stat
            label="Temps dans le plus long"
            value={route.longestTunnelSec ? formatShortTime(route.longestTunnelSec) : "—"}
          />
          <Stat
            label="Temps total en tunnel"
            value={route.totalTunnelSec ? formatShortTime(route.totalTunnelSec) : "—"}
          />
          <Stat
            label="Confiance"
            value={confidenceShort[route.confidence]}
          />
        </dl>

        <p className="mt-4 text-xs text-muted-foreground italic">
          {confidenceCopy[route.confidence]}
        </p>

        <section className="mt-4 rounded-xl px-3 py-3 bg-secondary/35 border border-border/50">
          <div className="text-xs font-medium text-foreground">Transparence de vérification</div>
          <p className="mt-1 text-xs text-foreground/80 leading-relaxed">
            {verificationExplain(route)}
          </p>
          {route.debug.verification.riskZoneDowngradeApplied && (
            <p className="mt-2 text-xs text-foreground/75 leading-relaxed">
              Ce trajet traverse une zone côtière ou de galeries connues pour une cartographie parfois incomplète. Une prudence supplémentaire a été appliquée.
            </p>
          )}
          {route.debug.verification.tunnelFreeDowngraded && route.tunnels.length === 0 && (
            <p className="mt-2 text-xs text-foreground/75 leading-relaxed">
              Ce trajet paraissait sans tunnel, mais il a été volontairement reclassé avec prudence pour éviter une fausse assurance.
            </p>
          )}
        </section>

        {routeIsUncertainTunnelFree && (
          <div className="mt-4 rounded-xl px-3 py-3 bg-[var(--color-comfort-moderate)]/30 border border-border/40">
            <div className="text-xs font-medium text-foreground">
              {route.certainty === "medium"
                ? "Certitude moyenne sur l'absence de tunnel"
                : "Certitude limitée sur l'absence de tunnel"}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground/80">
              Certaines portions de ce trajet peuvent être partiellement couvertes ou
              insuffisamment cartographiées. Nous te conseillons de vérifier l'itinéraire
              sur la carte avant le départ.
            </p>
            {route.certaintyReasons.length > 0 && (
              <ul className="mt-2 space-y-1">
                {route.certaintyReasons.map((r, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-foreground/70 flex gap-1.5 items-start"
                  >
                    <span className="mt-1.5 size-1 rounded-full bg-primary/60 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {prefsActive(prefs) && (
          <div
            className={`mt-4 text-xs rounded-xl px-3 py-2 leading-relaxed ${
              meets
                ? "bg-[var(--color-comfort-very)]/40 text-foreground/80"
                : "bg-[var(--color-comfort-moderate)]/40 text-foreground/80"
            }`}
          >
            <div className="font-medium">{prefsSummary(prefs)}</div>
            <div className="mt-0.5">
              {meets
                ? "Ce trajet respecte ta préférence de confort."
                : "Ce trajet ne respecte pas entièrement tes préférences."}
            </div>
          </div>
        )}
        {!data.anyCompliant && hasActivePrefs && (
          <div className="mt-3 text-xs rounded-xl px-3 py-2 bg-secondary/60 leading-relaxed">
            {prefs.maxTunnelLengthM === 0
              ? "Aucun trajet entièrement sans tunnel n'a été trouvé avec les données disponibles. L'alternative la plus proche est affichée séparément."
              : "Aucun itinéraire compatible avec tes préférences n'a été trouvé pour ce trajet. L'alternative la plus proche est affichée séparément."}
          </div>
        )}
      </section>

      <section>
        <RouteMap
          coords={route.coords}
          tunnels={route.tunnels}
          height={280}
          onTunnelClick={handleTunnelFocus}
          focusTunnelIndex={focusTunnel}
        />
      </section>

      {route.tunnels.length > 0 && (
        <section>
          <RouteTimeline
            durationSec={route.durationSec}
            tunnels={route.tunnels}
            onTunnelClick={handleTunnelFocus}
            activeIndex={focusTunnel}
          />
        </section>
      )}

      <section className="rounded-2xl bg-secondary/50 border border-border/60 p-4">
        <div className="text-sm font-medium">Ouvre ce trajet dans ton application de navigation</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={gmaps}
            target="_blank"
            rel="noreferrer"
            className="text-center rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium hover:opacity-95"
          >
            Ouvrir dans Google Maps
          </a>
          <a
            href={waze}
            target="_blank"
            rel="noreferrer"
            className="text-center rounded-xl bg-card border border-border py-3 text-sm font-medium hover:bg-background"
          >
            Ouvrir dans Waze
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          Après avoir ouvert ce trajet dans Waze ou Google Maps, vérifie bien
          que l'application conserve le même itinéraire. Waze peut parfois le
          recalculer.
        </p>
      </section>

      <ComparisonSection data={data} selectedIdx={selectedIdx} onSelect={onSelect} />
      {data.anyCompliant && (
        <p className="rounded-xl border border-border/40 bg-[var(--color-comfort-very)]/30 px-3 py-2 text-xs text-foreground/85">
          Tu peux être fière de toi d’avoir préparé le trajet à l’avance !
        </p>
      )}

      {(data.routes.length > 1 || (hasActivePrefs && fallbackEntries.length > 0)) && (
        <section>
          {compliantEntries.length > 0 && (
            <>
              <h2 className="text-sm font-medium mb-3">
                {hasActivePrefs ? "Trajets qui respectent tes préférences" : "Tous les itinéraires"}
              </h2>
              <div className="space-y-3">
                {compliantEntries.map(({ route: r, index: i }) => (
                  <div key={i} className="relative">
                    <RouteCard
                      route={r}
                      recommended={data.recommendedIndex !== null && i === data.recommendedIndex}
                      selected={i === selectedIdx}
                      onSelect={() => onSelect(i)}
                      showPreferenceBadge={hasActivePrefs}
                      matchesPreferences
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {hasActivePrefs && fallbackEntries.length > 0 && (
            <div className={compliantEntries.length > 0 ? "mt-5" : ""}>
              <h3 className="text-sm font-medium">Alternative la plus proche disponible</h3>
              <p className="mt-1 mb-3 text-xs text-muted-foreground leading-relaxed">
                {data.anyCompliant
                  ? "Ces trajets sont affichés uniquement pour comparaison car ils ne respectent pas entièrement ta préférence."
                  : "Aucun trajet entièrement sans tunnel n'a été trouvé avec les données disponibles. Cette option minimise l'exposition aux tunnels, mais elle en contient encore."}
              </p>
              <div className="space-y-3">
                {fallbackEntries.map(({ route: r, index: i }) => (
                  <RouteCard
                    key={i}
                    route={r}
                    recommended={false}
                    selected={i === selectedIdx}
                    onSelect={() => onSelect(i)}
                    showPreferenceBadge
                    matchesPreferences={false}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}


      {route.tunnels.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-3">Tunnels sur cet itinéraire</h2>
          <div className="space-y-3">
            {route.tunnels.map((t, i) => (
              <div
                key={i}
                ref={(el) => {
                  tunnelRefs.current[i] = el;
                }}
                className={`transition rounded-2xl ${
                  focusTunnel === i ? "ring-2 ring-primary/40" : ""
                }`}
              >
                <TunnelCard
                  tunnel={t}
                  index={i}
                />

              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <button
          onClick={() => setShowPanicSupport(true)}
          className="w-full rounded-full border border-primary/25 bg-[#fff4ee] py-3 text-sm text-foreground/90 shadow-soft transition hover:-translate-y-0.5 hover:shadow-md"
        >
          J’ai besoin d’être rassurée
        </button>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Respiration, soutien et conseils apaisants
        </p>
      </section>
      <Dialog open={showPanicSupport} onOpenChange={setShowPanicSupport}>
        <DialogContent className="max-w-md rounded-3xl border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Espace de calme</DialogTitle>
            <DialogDescription className="text-sm text-foreground/75">
              Prends quelques instants. Tu peux avancer à ton rythme.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-border/50 bg-secondary/25 p-3">
              <div className="font-medium">Respiration 4-7-8</div>
              <ul className="mt-2 space-y-1 text-foreground/80">
                <li>Inspire par le nez pendant 4 secondes.</li>
                <li>Retiens ton souffle pendant 7 secondes.</li>
                <li>Expire doucement par la bouche pendant 8 secondes.</li>
              </ul>
            </div>
            <p className="rounded-xl bg-[var(--color-comfort-very)]/25 px-3 py-2 text-foreground/85">
              Tu es incroyablement courageuse.
            </p>
            <div className="rounded-xl border border-border/50 p-3">
              <div className="font-medium">Ce que l’on sait sur ce trajet</div>
              <ul className="mt-2 space-y-1 text-foreground/80">
                <li>Durée estimée : {formatDuration(route.durationSec)}</li>
                <li>Tunnels confirmés : {route.tunnels.length}</li>
                <li>Tunnel confirmé le plus long : {route.longestTunnelM ? formatDistance(route.longestTunnelM) : "—"}</li>
                <li>Temps total estimé en tunnels : {route.totalTunnelSec ? formatShortTime(route.totalTunnelSec) : "—"}</li>
                <li>
                  Statut de vérification :{" "}
                  {route.verificationStatus === "VERIFIED"
                    ? "Données actuellement vérifiées"
                    : route.verificationStatus === "PARTIAL"
                      ? "Vérification partielle"
                      : "Vérification impossible"}
                </li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Glossary />

      {import.meta.env.DEV && data.debug && (
        <section className="rounded-2xl border border-dashed border-border/60 bg-secondary/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <div className="font-mono uppercase tracking-wider text-[10px] text-foreground/70 mb-1">
            Debug · recherche d'itinéraire
          </div>
          <ul className="space-y-0.5">
            <li>Tentatives de routage : {data.debug.routingAttempts}</li>
            <li>Détours testés : {data.debug.detourAttempts}</li>
            <li>Custom model utilisé : {data.debug.customModelUsed ? "oui" : "non"}</li>
            <li>Candidats sans tunnel trouvés : {data.debug.tunnelFreeCandidates}</li>
            <li>Préférence stricte « aucun tunnel » : {data.debug.strictNoTunnelsRequested ? "oui" : "non"}</li>
            {data.debug.noTunnelFreeReason && (
              <li>Raison : {data.debug.noTunnelFreeReason}</li>
            )}
          </ul>
        </section>
      )}


      <p className="text-xs text-center text-muted-foreground/80 leading-relaxed">
        Your Way fournit des estimations à partir de données cartographiques.
        Les conditions réelles peuvent varier. Ce n'est pas une application de navigation.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-3xl bg-card border border-border/60 p-8 shadow-soft text-center">
      <div className="flex justify-center">
        <Mascot size={104} />
      </div>
      <p className="mt-3 text-sm text-foreground/80">
        Your Way analyse doucement ton itinéraire…
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Comparaison des alternatives et repérage des tunnels.
      </p>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="font-medium">Nous n'avons pas pu analyser cet itinéraire</div>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Link
        to="/"
        className="inline-block mt-4 text-sm text-primary underline-offset-4 hover:underline"
      >
        Essayer une autre adresse
      </Link>
    </div>
  );
}

const confidenceShort = {
  high: "Élevée",
  medium: "Moyenne",
  low: "Limitée",
} as const;

function formatDeltaMin(deltaSec: number) {
  const m = Math.round(deltaSec / 60);
  if (m <= 0) return "Aucun temps en plus";
  if (m < 60) return `+${m} min par rapport au plus rapide`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm
    ? `+${h} h ${rm.toString().padStart(2, "0")} par rapport au plus rapide`
    : `+${h} h par rapport au plus rapide`;
}

function tunnelFreePhrase(r: AnalyzedRoute, capitalize = true): string {
  const strictTunnelFree =
    r.trulyTunnelFree &&
    r.verificationStatus === "VERIFIED" &&
    r.certainty === "high";
  const lead = strictTunnelFree
    ? "Aucun tunnel confirmé avec les données actuellement vérifiées"
    : r.verificationStatus === "FAILED"
      ? "Impossible de confirmer l'absence de tunnel sur ce trajet"
      : r.verificationStatus === "PARTIAL"
        ? "Aucun tunnel confirmé"
        : "Trajet probablement sans tunnel";
  return capitalize ? lead : lead.charAt(0).toLowerCase() + lead.slice(1);
}

function tunnelSummary(r: AnalyzedRoute) {
  if (r.tunnels.length === 0) return tunnelFreePhrase(r);
  if (r.tunnels.length === 1) {
    const t = r.tunnels[0];
    const size = t.lengthM < 200 ? "court" : t.lengthM < 600 ? "moyen" : "long";
    return `Un seul tunnel ${size} détecté`;
  }
  return `${r.tunnels.length} tunnels détectés`;
}

function routeIntro(route: AnalyzedRoute) {
  if (route.tunnels.length === 0) {
    if (route.verificationStatus === "FAILED") {
      return "La vérification cartographique n’a pas pu être finalisée. Ce trajet ne peut donc pas être confirmé comme sans tunnel.";
    }
    if (
      route.trulyTunnelFree &&
      route.verificationStatus === "VERIFIED" &&
      route.certainty === "high"
    ) {
      return "Aucun tunnel confirmé avec les données actuellement vérifiées. Ce trajet respecte ta préférence de confort.";
    }
    if (route.verificationStatus === "PARTIAL") {
      return "Vérification cartographique partielle. Aucun tunnel confirmé avec les données actuellement vérifiées.";
    }
    return "Trajet probablement sans tunnel. Nous te conseillons de vérifier l'itinéraire sur la carte avant le départ.";
  }
  return comfortBlurb[route.comfort];
}

function trustBadge(route: AnalyzedRoute): { label: string; className: string } {
  if (route.verificationStatus === "VERIFIED") {
    return { label: "Vérifié", className: "bg-[var(--color-comfort-very)]/45 text-foreground" };
  }
  if (route.verificationStatus === "FAILED") {
    return {
      label: "Vérification impossible",
      className: "bg-[var(--color-comfort-moderate)]/35 text-foreground",
    };
  }
  return { label: "Vérification partielle", className: "bg-secondary text-foreground/85" };
}

function verificationExplain(route: AnalyzedRoute): string {
  return verificationCopy[route.verificationStatus];
}

export function favoriteRouteEncouragementMessage(): string {
  return "Félicitations pour ce trajet !";
}

function emotionalScore(route: AnalyzedRoute): { label: EmotionalLabel } {
  const sensitive =
    route.verificationStatus === "FAILED" ||
    route.certainty === "low" ||
    route.geoRisk === "high";
  if (sensitive) return { label: "Zone sensible" };
  if (
    route.tunnels.length >= 3 ||
    route.totalTunnelSec > 240 ||
    route.longestTunnelM > 800 ||
    route.verificationStatus === "PARTIAL"
  ) {
    return { label: "Demande un peu d’attention" };
  }
  if (route.tunnels.length >= 1 || route.totalTunnelSec > 80) return { label: "Confortable" };
  if (route.tunnels.length === 0 && route.certainty === "high") return { label: "Très apaisant" };
  return { label: "Apaisant" };
}

function ComparisonCard({
  title,
  badge,
  route,
  fastestDurationSec,
  isSelected,
  onSelect,
  tone,
  note,
}: {
  title: string;
  badge?: string;
  route: AnalyzedRoute;
  fastestDurationSec: number;
  isSelected: boolean;
  onSelect: () => void;
  tone: "comfort" | "tunnel-free" | "fastest";
  note?: string;
}) {
  const toneClasses =
    tone === "tunnel-free"
      ? "bg-[var(--color-comfort-very)]/30 border-[var(--color-comfort-very)]/60"
      : tone === "fastest"
        ? "bg-secondary/40 border-border/60"
        : "bg-card border-border/60";
  const verification = trustBadge(route);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border p-4 shadow-soft transition ${toneClasses} ${
        isSelected ? "ring-2 ring-primary/30" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          {badge && (
            <div className="text-[10px] uppercase tracking-wider font-semibold text-primary/90 mb-1">
              {badge}
            </div>
          )}
          <div className="font-medium">{title}</div>
          <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${verification.className}`}>
            {verification.label}
          </div>
        </div>
        <ComfortBadge score={route.comfort} size="sm" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-background/60 px-3 py-2">
          <div className="text-muted-foreground">Durée</div>
          <div className="font-medium">{formatDuration(route.durationSec)}</div>
        </div>
        <div className="rounded-xl bg-background/60 px-3 py-2">
          <div className="text-muted-foreground">Distance</div>
          <div className="font-medium">{formatDistance(route.distanceM)}</div>
        </div>
        <div className="rounded-xl bg-background/60 px-3 py-2">
          <div className="text-muted-foreground">Tunnels</div>
          <div className="font-medium">{route.tunnels.length}</div>
        </div>
        <div className="rounded-xl bg-background/60 px-3 py-2">
          <div className="text-muted-foreground">Plus long</div>
          <div className="font-medium">
            {route.longestTunnelM ? formatDistance(route.longestTunnelM) : "—"}
          </div>
        </div>
        <div className="rounded-xl bg-background/60 px-3 py-2 col-span-2">
          <div className="text-muted-foreground">Temps total en tunnel</div>
          <div className="font-medium">
            {route.totalTunnelSec ? formatShortTime(route.totalTunnelSec) : "—"}
          </div>
        </div>
        <div className="rounded-xl bg-background/60 px-3 py-2 col-span-2">
          <div className="text-muted-foreground">Confiance</div>
          <div className="font-medium">{confidenceShort[route.confidence]}</div>
        </div>
      </div>

      <p className="mt-3 text-xs text-foreground/80">{tunnelSummary(route)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatDeltaMin(route.durationSec - fastestDurationSec)}
      </p>
      {note && (
        <p className="mt-2 text-xs leading-relaxed text-foreground/75">{note}</p>
      )}
      {route.verificationStatus === "FAILED" && (
        <p className="mt-2 text-xs leading-relaxed text-foreground/75">
          La vérification cartographique n’a pas pu être finalisée. Ce trajet ne peut donc pas être confirmé comme sans tunnel.
        </p>
      )}
    </button>
  );
}

function ComparisonSection({
  data,
  selectedIdx,
  onSelect,
}: {
  data: ResultsData;
  selectedIdx: number;
  onSelect: (i: number) => void;
}) {
  const fastest = data.routes[data.fastestIndex];
  const comfy = data.recommendedIndex !== null ? data.routes[data.recommendedIndex] : null;
  const fallback = data.fallbackIndex !== null ? data.routes[data.fallbackIndex] : null;
  const tunnelFreeIdx = data.tunnelFreeIndex;
  const tunnelFree =
    tunnelFreeIdx !== null ? data.routes[tunnelFreeIdx] : null;
  const fastestDoesNotMatch = !data.anyCompliant;
  const fastestIsFallback = data.fallbackIndex === data.fastestIndex;

  const cards: Array<{
    key: string;
    title: string;
    badge?: string;
    idx: number;
    route: AnalyzedRoute;
    tone: "comfort" | "tunnel-free" | "fastest";
    note?: string;
  }> = [];

  cards.push({
    key: "fastest",
    title: fastestIsFallback ? "Alternative la plus proche disponible" : "Le plus rapide",
    badge: fastestDoesNotMatch ? "Ne respecte pas entièrement ta préférence" : "Référence",
    idx: data.fastestIndex,
    route: fastest,
    tone: "fastest",
    note:
      fastestDoesNotMatch
        ? "Cette option minimise l'exposition aux tunnels détectés, mais elle en contient encore."
        : fastest.tunnels.length === 0
        ? `${tunnelFreePhrase(fastest)}.`
        : "Ce trajet est le plus court en temps, mais il contient quelques tunnels.",
  });

  if (comfy && data.recommendedIndex !== null && data.recommendedIndex !== data.fastestIndex) {
    const deltaMin = Math.round((comfy.durationSec - fastest.durationSec) / 60);
    cards.push({
      key: "comfort",
      title:
        comfy.tunnels.length === 0
          ? (comfy.trulyTunnelFree &&
            comfy.verificationStatus === "VERIFIED" &&
            comfy.certainty === "high")
            ? "Trajet sans tunnel"
            : comfy.verificationStatus === "PARTIAL" || comfy.certainty === "medium"
              ? "Trajet probablement sans tunnel"
              : "Aucun tunnel confirmé"
          : "Le plus confortable",
      badge: "Respecte tes préférences",
      idx: data.recommendedIndex,
      route: comfy,
      tone: "comfort",
      note:
        comfy.tunnels.length === 0
          ? `${tunnelFreePhrase(comfy)}.`
          : `Ce trajet réduit l'exposition aux tunnels${
              deltaMin > 0 ? ` en ajoutant environ ${deltaMin} min` : ""
            }.`,
    });
  } else if (fallback && data.fallbackIndex !== data.fastestIndex) {
    cards.push({
      key: "fallback",
      title: "Alternative la plus proche disponible",
      badge: "Ne respecte pas entièrement ta préférence",
      idx: data.fallbackIndex!,
      route: fallback,
      tone: "comfort",
      note: "Cette option minimise l'exposition aux tunnels détectés, mais elle en contient encore.",
    });
  }

  if (
    tunnelFree &&
    tunnelFreeIdx !== null &&
    tunnelFreeIdx !== data.fastestIndex &&
    tunnelFreeIdx !== data.recommendedIndex
  ) {
    const deltaMin = Math.round(
      (tunnelFree.durationSec - fastest.durationSec) / 60,
    );
    cards.push({
      key: "tunnel-free",
      title:
        tunnelFree.trulyTunnelFree &&
        tunnelFree.verificationStatus === "VERIFIED" &&
        tunnelFree.certainty === "high"
          ? "Trajet sans tunnel"
          : tunnelFree.verificationStatus === "PARTIAL"
            ? "Trajet probablement sans tunnel"
            : "Aucun tunnel confirmé",
      badge:
        tunnelFree.verificationStatus === "VERIFIED"
          ? "Aucun tunnel confirmé"
          : "Vérification cartographique partielle",
      idx: tunnelFreeIdx,
      route: tunnelFree,
      tone: "tunnel-free",
      note:
        deltaMin > 0
          ? `${tunnelFreePhrase(tunnelFree)}, avec environ ${deltaMin} min en plus.`
          : `${tunnelFreePhrase(tunnelFree)}, sans temps supplémentaire.`,
    });
  } else if (
    tunnelFree &&
    tunnelFreeIdx !== null &&
    (tunnelFreeIdx === data.fastestIndex ||
      tunnelFreeIdx === data.recommendedIndex)
  ) {
    const existing = cards.find((c) => c.idx === tunnelFreeIdx);
    if (existing) {
      existing.title = tunnelFree.trulyTunnelFree
        && tunnelFree.verificationStatus === "VERIFIED"
        && tunnelFree.certainty === "high"
          ? "Trajet sans tunnel"
        : tunnelFree.verificationStatus === "PARTIAL" || tunnelFree.certainty === "medium"
          ? "Trajet probablement sans tunnel"
          : "Aucun tunnel confirmé";
      existing.badge = tunnelFree.verificationStatus === "VERIFIED"
        ? "Aucun tunnel confirmé"
        : "Vérification cartographique partielle";
      existing.tone = "tunnel-free";
      existing.note = `${tunnelFreePhrase(tunnelFree)}.`;
    }
  }

  return (
    <section className="rounded-3xl bg-secondary/30 border border-border/50 p-4">
      <h2 className="text-sm font-medium">Confort ou temps : à toi de choisir</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-4 leading-relaxed">
        Your Way te propose plusieurs options. Compare-les calmement et choisis
        celle qui te semble la plus rassurante.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c) => (
          <ComparisonCard
            key={c.key}
            title={c.title}
            badge={c.badge}
            route={c.route}
            fastestDurationSec={fastest.durationSec}
            isSelected={selectedIdx === c.idx}
            onSelect={() => onSelect(c.idx)}
            tone={c.tone}
            note={c.note}
          />
        ))}
      </div>

      {!data.tunnelFreeAvailable && (
        <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
          Aucun trajet entièrement sans tunnel n'a été trouvé avec les données disponibles.
          L'alternative la plus proche est affichée séparément si nécessaire.
        </p>
      )}
      {tunnelFree && !data.tunnelFreeStrict && (
        <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
          Vérification cartographique partielle. Impossible de confirmer l'absence de tunnel sur ce trajet.
        </p>
      )}
    </section>
  );
}

function prefsActive(p: Preferences): boolean {
  return (
    p.maxTunnelLengthM !== null ||
    p.maxTotalTunnelSec !== null ||
    p.avoidClosed ||
    p.preferTunnelFree
  );
}

function prefsSummary(p: Preferences): string {
  const bits: string[] = [];
  if (p.maxTunnelLengthM !== null) bits.push(`tunnel ${maxLengthLabel(p.maxTunnelLengthM).toLowerCase()}`);
  if (p.maxTotalTunnelSec !== null) bits.push(`temps total ${maxTotalLabel(p.maxTotalTunnelSec).toLowerCase()}`);
  if (p.avoidClosed) bits.push("éviter les tunnels fermés");
  if (p.preferTunnelFree) bits.push("préférer sans tunnel");
  return bits.length ? `Tes préférences : ${bits.join(" · ")}` : "Tes préférences";
}

function NoTunnelFreeModal({
  open,
  onClose,
  onSeeAlternative,
  hasFallback,
}: {
  open: boolean;
  onClose: () => void;
  onSeeAlternative: () => void;
  hasFallback: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-3xl border border-primary/20 bg-[#fffaf5] text-slate-900 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-900">
            Aucun trajet sans tunnel trouvé
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-800">
            Your Way a tenté plusieurs détours pour éviter les tunnels détectés sur ce trajet.
            Malgré ces essais, aucun itinéraire entièrement sans tunnel n'a été trouvé avec les
            données disponibles.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 rounded-2xl border border-border/60 bg-[#fff3f1] p-4 text-xs leading-relaxed text-slate-800">
          <div className="mb-2 font-medium text-slate-900">Cela peut arriver si :</div>
          <ul className="space-y-1">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 rounded-full bg-primary/75 shrink-0" />
              <span>les tunnels sont situés sur des axes incontournables ;</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 rounded-full bg-primary/75 shrink-0" />
              <span>les routes alternatives disponibles repassent aussi par des tunnels ;</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 rounded-full bg-primary/75 shrink-0" />
              <span>certaines données cartographiques ne permettent pas encore d'identifier un détour fiable.</span>
            </li>
          </ul>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-700">
          L'alternative affichée est celle qui réduit le plus possible l'exposition aux tunnels.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {hasFallback && (
            <button
              type="button"
              onClick={onSeeAlternative}
              className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-95 sm:flex-1"
            >
              Voir l'alternative la plus proche
            </button>
          )}
          <Link
            to="/"
            className="w-full text-center rounded-xl bg-white border border-border py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50 sm:flex-1"
          >
            Modifier mes préférences
          </Link>
          <Link
            to="/"
            className="w-full text-center rounded-xl bg-white border border-border py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50 sm:flex-1"
          >
            Changer d'adresse
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UncertainRouteModal({
  open,
  onClose,
  certainty,
  reasons,
}: {
  open: boolean;
  onClose: () => void;
  certainty: "high" | "medium" | "low";
  reasons: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl bg-[var(--color-comfort-moderate)]/25 border-border/50">
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-foreground">
            {certainty === "medium"
              ? "Trajet probablement sans tunnel"
              : "Aucun tunnel clairement identifié"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-foreground/80">
            Certaines portions de ce trajet peuvent être partiellement couvertes ou
            insuffisamment cartographiées. Nous te conseillons de vérifier l'itinéraire
            sur la carte avant le départ.
          </DialogDescription>
        </DialogHeader>

        {reasons.length > 0 && (
          <div className="rounded-2xl bg-background/60 border border-border/50 p-3 text-xs leading-relaxed text-foreground/80">
            <div className="font-medium text-foreground mb-1.5">Pourquoi cette prudence ?</div>
            <ul className="space-y-1">
              {reasons.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 size-1 rounded-full bg-primary/70 shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs leading-relaxed text-foreground/70 italic">
          Your Way préfère t'avertir plutôt que de promettre un trajet entièrement sans
          tunnel sans en avoir la certitude.
        </p>

        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-95"
          >
            J'ai compris, voir le trajet sur la carte
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
