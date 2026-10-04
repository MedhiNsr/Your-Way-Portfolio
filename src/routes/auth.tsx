import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "À propos des données — Your Way" }] }),
  component: DataNoticePage,
});

function DataNoticePage() {
  return (
    <main className="min-h-screen px-5 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Version portfolio</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Cette copie ne crée pas de compte et ne conserve ni trajet enregistré ni note personnelle.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm underline">Retour à Your Way</Link>
      </div>
    </main>
  );
}
