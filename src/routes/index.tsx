import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { usePreferences } from "@/lib/preferences";
import { PreferencesPanel } from "@/components/PreferencesPanel";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Mascot } from "@/components/Mascot";
import { AuthBar } from "@/components/AuthBar";
import { reverseGeocode } from "@/lib/routing.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Your Way — prépare ton trajet en toute sérénité" },
      {
        name: "description",
        content:
          "Your Way t'aide à repérer les tunnels et à comparer des itinéraires plus confortables avant de prendre la route.",
      },
      { property: "og:title", content: "Your Way" },
      {
        property: "og:description",
        content: "Ton compagnon de voyage calme, à utiliser avant de partir.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [prefs, setPrefs] = usePreferences();
  const [showPrefs, setShowPrefs] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const runReverse = useServerFn(reverseGeocode);
  const [showPanicSupport, setShowPanicSupport] = useState(false);

  const useMyLocation = () => {
    setGeoMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMsg("Position indisponible pour le moment.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await runReverse({
            data: { lat: latitude, lng: longitude },
          });
          if (res.label) {
            setFrom(res.label);
            setGeoMsg("Position détectée. Tu peux la modifier si besoin.");
          } else {
            setFrom(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
            setGeoMsg("Nous n'avons pas pu convertir ta position en adresse.");
          }
        } catch {
          setGeoMsg("Nous n'avons pas pu convertir ta position en adresse.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoMsg("Localisation refusée. Tu peux entrer ton adresse manuellement.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoMsg("Position indisponible pour le moment.");
        } else {
          setGeoMsg("Impossible d'accéder à ta position. Tu peux saisir ton adresse manuellement.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const canSubmit = from.trim().length > 1 && to.trim().length > 1;

  return (
    <main className="min-h-screen w-full relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {[
          { left: "8%", top: "6%", size: 14, delay: "0s", duration: "9s", opacity: 0.18 },
          { left: "22%", top: "18%", size: 10, delay: "1.4s", duration: "11s", opacity: 0.14 },
          { left: "78%", top: "10%", size: 18, delay: "0.6s", duration: "10s", opacity: 0.22 },
          { left: "88%", top: "28%", size: 12, delay: "2.2s", duration: "12s", opacity: 0.16 },
          { left: "5%", top: "40%", size: 16, delay: "3s", duration: "13s", opacity: 0.18 },
          { left: "92%", top: "52%", size: 10, delay: "1.8s", duration: "10s", opacity: 0.14 },
          { left: "14%", top: "62%", size: 13, delay: "0.4s", duration: "11s", opacity: 0.16 },
          { left: "70%", top: "72%", size: 18, delay: "2.6s", duration: "12s", opacity: 0.2 },
          { left: "30%", top: "84%", size: 11, delay: "1s", duration: "10s", opacity: 0.15 },
          { left: "55%", top: "94%", size: 15, delay: "3.4s", duration: "13s", opacity: 0.18 },
          { left: "45%", top: "32%", size: 9, delay: "2s", duration: "11s", opacity: 0.12 },
          { left: "60%", top: "48%", size: 12, delay: "0.8s", duration: "12s", opacity: 0.15 },
        ].map((h, i) => (
          <svg
            key={i}
            className="absolute text-primary"
            style={{
              left: h.left,
              top: h.top,
              width: h.size,
              height: h.size,
              opacity: h.opacity,
              animation: `floatHeart ${h.duration} ease-in-out ${h.delay} infinite`,
            }}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4.5 4.5 8.5C19 16.65 12 21 12 21z" />
          </svg>
        ))}
      </div>
      <style>{`
        @keyframes floatHeart {
          0%, 100% { transform: translateY(0) rotate(-4deg); }
          50% { transform: translateY(-12px) rotate(4deg); }
        }
      `}</style>
      <div className="mx-auto max-w-md px-5 pt-6 pb-16 relative">
        <AuthBar />
        <div className="mt-4 sticky top-3 z-20">
          <button
            onClick={() => setShowPanicSupport(true)}
            className="w-full rounded-full border border-primary/25 bg-[#fff4ee] py-3 text-sm text-foreground/90 shadow-soft transition hover:-translate-y-0.5 hover:shadow-md"
          >
            J’ai besoin d’être rassurée
          </button>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Respiration, soutien et conseils apaisants
          </p>
        </div>
        <header className="text-center mb-10 mt-6">

          <div className="flex justify-center mb-3">
            <Mascot size={132} priority />
          </div>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary/80 mb-3">
            <span className="size-1.5 rounded-full bg-primary" />
            Your Way
          </div>
          <h1 className="text-4xl leading-tight">
            Tu peux préparer ton trajet en toute sérénité.
          </h1>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            Ton compagnon de voyage tout en douceur, qui repère les tunnels et
            t'aide à choisir l'itinéraire le plus apaisant avant même d'avoir
            démarré la voiture.
          </p>
        </header>


        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            navigate({
              to: "/analyze",
              search: { from: from.trim(), to: to.trim() },
            });
          }}
        >
          <AddressAutocomplete label="Adresse de départ" value={from} onChange={setFrom} placeholder="ex. Paris, France" />
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 text-primary py-3 text-sm font-medium transition hover:bg-primary/10 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            {locating ? "Recherche de ta position actuelle…" : "Utiliser ma position actuelle"}
          </button>
          {geoMsg && (
            <p className="text-xs text-muted-foreground px-1 -mt-1">{geoMsg}</p>
          )}
          <AddressAutocomplete label="Arrivée" value={to} onChange={setTo} placeholder="ex. Lyon, France" />

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full mt-2 rounded-2xl bg-primary text-primary-foreground py-4 font-medium shadow-soft transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95"
          >
            Analyser l'itinéraire
          </button>
        </form>

        <div className="mt-8">
          <button
            onClick={() => setShowPrefs((s) => !s)}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {showPrefs ? "Masquer" : "Définir"} mes préférences de confort
          </button>
          {showPrefs && (
            <div className="mt-3">
              <PreferencesPanel prefs={prefs} onChange={setPrefs} />
            </div>
          )}
        </div>

        <p className="mt-10 text-xs text-center text-muted-foreground/80 leading-relaxed">
          Your Way est ton assistant de route. Vérifie ton itinéraire dans ton
          application GPS lorsque tu exportes ton trajet.
        </p>
        <p className="mt-6 text-xs text-center text-muted-foreground/70">
          Prototype produit conçu avec des outils d’IA et validé par son auteur.
        </p>
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
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
