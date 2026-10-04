import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/memory")({
  head: () => ({ meta: [{ title: "Carnet personnel — Your Way" }] }),
  component: MemoryNoticePage,
});

function MemoryNoticePage() {
  return (
    <main className="min-h-screen px-5 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">Carnet personnel</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Cette fonctionnalité est une piste produit ; elle n’est pas incluse dans cette version portfolio.
          Aucun historique de trajets ni note personnelle n’y est enregistré.
        </p>
        <Link to="/analyze" className="mt-6 inline-block text-sm underline">Analyser un trajet</Link>
      </div>
    </main>
  );
}
