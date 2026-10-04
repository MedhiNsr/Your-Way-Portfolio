import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const repoSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Format attendu: owner/repo");

export type PullRequestSummary = {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  mergedAt: string | null;
  mergeCommitSha: string | null;
  baseRef: string;
  headRef: string;
  author: string | null;
  url: string;
  updatedAt: string;
};

export type GithubStatusResult = {
  repo: string;
  defaultBranch: string;
  latestMainSha: string | null;
  latestMainMessage: string | null;
  latestMainDate: string | null;
  pulls: PullRequestSummary[];
  fetchedAt: string;
};

async function gh<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "yourway-pr-status",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} (${url}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const getGithubStatus = createServerFn({ method: "GET" })
  .inputValidator((data: { repo: string }) => ({
    repo: repoSchema.parse(data.repo),
  }))
  .handler(async ({ data }): Promise<GithubStatusResult> => {
    const { repo } = data;

    const repoInfo = await gh<{ default_branch: string }>(
      `https://api.github.com/repos/${repo}`,
    );
    const defaultBranch = repoInfo.default_branch || "main";

    const [pulls, latestCommits] = await Promise.all([
      gh<
        Array<{
          number: number;
          title: string;
          state: "open" | "closed";
          merged_at: string | null;
          merge_commit_sha: string | null;
          base: { ref: string };
          head: { ref: string };
          user: { login: string } | null;
          html_url: string;
          updated_at: string;
        }>
      >(
        `https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=20`,
      ),
      gh<
        Array<{
          sha: string;
          commit: { message: string; author: { date: string } };
        }>
      >(
        `https://api.github.com/repos/${repo}/commits?sha=${defaultBranch}&per_page=1`,
      ),
    ]);

    const latest = latestCommits[0];

    return {
      repo,
      defaultBranch,
      latestMainSha: latest?.sha ?? null,
      latestMainMessage: latest?.commit.message.split("\n")[0] ?? null,
      latestMainDate: latest?.commit.author.date ?? null,
      pulls: pulls.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        merged: Boolean(p.merged_at),
        mergedAt: p.merged_at,
        mergeCommitSha: p.merge_commit_sha,
        baseRef: p.base.ref,
        headRef: p.head.ref,
        author: p.user?.login ?? null,
        url: p.html_url,
        updatedAt: p.updated_at,
      })),
      fetchedAt: new Date().toISOString(),
    };
  });
