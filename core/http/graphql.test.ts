import { client } from "@roka/http/graphql";
import { mockFetch } from "@roka/testing/mock";
import { assertSnapshot } from "@std/testing/snapshot";

const token = Deno.env.get("GITHUB_TOKEN") ?? "TOKEN";

interface Issue {
  number: number;
  title: string;
  state: string;
}

interface Issues {
  repository: {
    issues: {
      nodes: Issue[];
      pageInfo: {
        endCursor: string | null;
        hasNextPage: boolean;
      };
    };
  };
}

Deno.test("client().query()", async (t) => {
  using _fetch = mockFetch(t);
  const api = client("https://api.github.com/graphql", { token });
  const result: Issues = await api.query(
    `
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          issues(first: 1) {
            nodes {
              number
              state
            }
          }
        }
      }
    `,
    { owner: "withroka", name: "test" },
  );
  await assertSnapshot(t, result);
});

Deno.test("client().queryPaginated()", async (t) => {
  using _fetch = mockFetch(t);
  const api = client("https://api.github.com/graphql", { token });
  const result = await api.queryPaginated(
    `
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          issues(first: 100) {
            nodes {
              number
              title
              state
            }
            pageInfo {
              endCursor
              startCursor
              hasNextPage
              hasPreviousPage
            }
          }
        }
      }
    `,
    {
      edges: (issues: Issues) => issues.repository.issues.nodes,
      node: (edge) => edge,
      pageInfo: (issues) => issues.repository.issues.pageInfo,
      cursor: (pageInfo) => pageInfo.hasNextPage ? pageInfo.endCursor : null,
    },
    { owner: "withroka", name: "test" },
  );
  await assertSnapshot(t, result);
});
