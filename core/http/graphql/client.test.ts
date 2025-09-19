import { mockFetch } from "@roka/http/testing";
import { fakeEnv } from "@roka/testing/fake";
import type { Mock } from "@roka/testing/mock";
import { assertSnapshot } from "@std/testing/snapshot";
import { client, gql } from "./client.ts";

interface Repository {
  owner: string;
  name: string;
  description: string;
}

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

function token(mock?: Mock<typeof fetch>) {
  return mock?.mode === "update" ? Deno.env.get("GITHUB_TOKEN") ?? "" : "token";
}

Deno.test("client().query() makes GraphQL query", async (t) => {
  using _fetch = mockFetch(t);
  using _env = fakeEnv({ NODE_ENV: "test" }); // queried by urql
  const api = client("https://api.github.com/graphql", {
    token: token(_fetch),
  });
  const result = await api.query(
    gql<{ repository: Repository }>`
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          owner {
            login
          },
          name,
          description
        }
      }
    `,
    { owner: "withroka", name: "test" },
  );
  await assertSnapshot(t, result);
});

Deno.test("client().queryPaginated() makes paginated GraphQL query", async (t) => {
  using _fetch = mockFetch(t);
  using _env = fakeEnv({ NODE_ENV: "test" }); // queried by urql
  const api = client("https://api.github.com/graphql", {
    token: token(_fetch),
  });
  const result = await api.queryPaginated(
    gql`
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
