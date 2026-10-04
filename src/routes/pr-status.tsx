import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getGithubStatus } from "@/lib/github.functions";
import { BUILD_SHA } from "@/lib/build-info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DEFAULT_REPO = "MedhiNsr/Your-Way-Portfolio";

export const Route = createFileRoute("/pr-status")({
  head: () => ({
    meta: [
      { title: "État des PR — Your Way" },
      {
        name: "description",
        content:
          "Suivi des pull requests GitHub et vérification de la synchronisation de l'environnement déployé.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    repo: typeof s.repo === "string" && s.repo.length > 0 ? s.repo : undefined,
  }),
  component: PrStatusPage,
});

function shortSha(sha: string | null | undefined) {
  return sha ? sha.slice(0, 7) : "—";
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function PrStatusPage() {
  const search = Route.useSearch();
  const initial = search.repo ?? DEFAULT_REPO;
  const [repoInput, setRepoInput] = useState(initial);
  const [repo, setRepo] = useState(initial);
  const fetchStatus = useServerFn(getGithubStatus);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["github-status", repo],
    queryFn: () => fetchStatus({ data: { repo } }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const buildSha = BUILD_SHA;
  const latestSha = data?.latestMainSha ?? null;
  const upToDate = latestSha && buildSha !== "unknown" ? latestSha === buildSha : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">État des PR</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vérifie l'état des pull requests sur GitHub et la synchronisation
            de l'environnement déployé.
          </p>
        </div>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Accueil
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRepo(repoInput.trim());
        }}
        className="mb-6 flex flex-wrap gap-2"
      >
        <Input
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          placeholder="owner/repo"
          className="max-w-xs"
        />
        <Button type="submit" variant="default">
          Charger
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Rafraîchissement…" : "Rafraîchir"}
        </Button>
      </form>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Environnement déployé</CardTitle>
          <CardDescription>
            Comparaison entre le commit embarqué dans ce build et le dernier
            commit sur <code>{data?.defaultBranch ?? "main"}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Build actuel :</span>
            <code className="rounded bg-muted px-2 py-0.5">
              {shortSha(buildSha)}
            </code>
            {buildSha === "unknown" && (
              <span className="text-xs text-muted-foreground">
                (SHA indisponible — build local sans git)
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Dernier sur main :</span>
            <code className="rounded bg-muted px-2 py-0.5">
              {shortSha(latestSha)}
            </code>
            {data?.latestMainMessage && (
              <span className="text-muted-foreground">
                — {data.latestMainMessage}
              </span>
            )}
          </div>
          <div>
            {upToDate === null ? (
              <Badge variant="outline">État inconnu</Badge>
            ) : upToDate ? (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                ✓ Environnement à jour
              </Badge>
            ) : (
              <Badge variant="destructive">⚠ Désynchronisé</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pull requests</CardTitle>
          <CardDescription>
            {data
              ? `20 dernières PR de ${data.repo} (mises à jour le ${formatDate(
                  data.fetchedAt,
                )})`
              : "Chargement…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}
          {error && (
            <p className="text-sm text-destructive">
              Erreur : {(error as Error).message}
            </p>
          )}
          {data && data.pulls.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune PR trouvée.</p>
          )}
          {data && data.pulls.length > 0 && (
            <ul className="divide-y divide-border">
              {data.pulls.map((pr) => {
                const isDeployed =
                  pr.merged &&
                  pr.mergeCommitSha &&
                  buildSha !== "unknown" &&
                  pr.mergeCommitSha === buildSha;
                return (
                  <li
                    key={pr.number}
                    className="flex flex-wrap items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        #{pr.number} {pr.title}
                      </a>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {pr.author ?? "—"} • {pr.headRef} → {pr.baseRef} •{" "}
                        {pr.merged
                          ? `mergée le ${formatDate(pr.mergedAt)}`
                          : pr.state === "open"
                            ? "ouverte"
                            : `fermée le ${formatDate(pr.updatedAt)}`}
                        {pr.mergeCommitSha && (
                          <>
                            {" "}
                            • merge <code>{shortSha(pr.mergeCommitSha)}</code>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {pr.merged ? (
                        <Badge className="bg-purple-600 text-white hover:bg-purple-600">
                          Mergée
                        </Badge>
                      ) : pr.state === "open" ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          Ouverte
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Fermée</Badge>
                      )}
                      {isDeployed && (
                        <Badge variant="outline" className="text-xs">
                          ✓ déployée
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
