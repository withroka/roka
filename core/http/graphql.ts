/**
 * This module provides the {@linkcode graphqlClient} function to create a GraphQL
 * client for making requests. Useful for building GraphQL based API clients.
 *
 * ```ts
 * import { graphqlClient } from "@roka/http/graphql";
 * async function usage() {
 *   const api = graphqlClient("https://api.github.com/graphql");
 *   const query = await Deno.readTextFile("repo.graphql");
 *   const repo = await api.query(query, {
 *     owner: "owner", name: "name",
 *   });
 * }
 * ```
 *
 * @module graphql
 */

import { RequestError } from "@roka/http/request";
import {
  type AnyVariables,
  cacheExchange,
  Client,
  fetchExchange,
} from "@urql/core";
import { retryExchange } from "@urql/exchange-retry";

/** A GraphQL client returned by {@linkcode graphqlClient}. */
export interface GraphQLClient {
  /** Makes a GraphQL query. */
  query<Result>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<Result>;
  /** Makes a paginated GraphQL query, given a {@linkcode GraphQLPaginator}. */
  queryPaginated<Result, Node, Edge, PageInfo>(
    query: string,
    paginator: GraphQLPaginator<Result, Node, Edge, PageInfo>,
    variables?: Record<string, unknown>,
  ): Promise<Node[]>;
}

/** Options for {@linkcode graphqlClient}. */
export interface GraphQLClientOptions {
  /** The bearer token to be sent with the request headers. */
  token?: string;
}

/** A GraphQL paginator that traverses response data to generate pages.
 *
 * A custom paginator is needed by {@linkcode graphqlClient.queryPaginated} for
 * nodes it is querying.
 */
export interface GraphQLPaginator<Result, Node, Edge, PageInfo> {
  /** Extracts edges from the response data. */
  edges(data: Result): Edge[];
  /** Extracts nodes from an edge. */
  node(edge: Edge): Node;
  /** Extracts an object that contains page and cursor information. */
  pageInfo(data: Result): PageInfo;
  /**
   * Extracts the cursor for the next page from page information.
   *
   * This function must return `null` if there are no more pages.
   */
  cursor(pageInfo: PageInfo): string | null;
}

/**
 * Creates an HTTP client for making GraphQL requests.
 *
 * @example Make a GraphQL query.
 * ```ts
 * import { graphqlClient } from "@roka/http/graphql";
 *
 * interface Repository {
 *   owner: string;
 *   name: string;
 *   description: string;
 * }
 *
 * async function usage() {
 *   const api = graphqlClient("https://api.github.com/graphql");
 *   const { repository } = await api.query<{ repository: Repository }>(`
 *     query($owner: String!, $name: String!) {
 *       repository(owner: $owner, name: $name) {
 *         description
 *       }
 *    }
 *  `,
 *  { owner: "owner", name: "repo" });
 *  console.log(repository.description);
 * };
 * ```
 *
 * @example Make a paginated GraphQL query.
 * ```ts
 * import { graphqlClient } from "@roka/http/graphql";
 *
 * interface Issue {
 *  number: number;
 *  title: string;
 *  state: string;
 * }
 *
 * interface Issues {
 *   repository: {
 *     issues: {
 *       nodes: Issue[];
 *       pageInfo: {
 *         endCursor: string | null;
 *         hasNextPage: boolean;
 *       };
 *     };
 *   };
 * }
 *
 * async function usage() {
 *   const api = graphqlClient("https://api.github.com/graphql");
 *   const issues: Issue[] = await api.queryPaginated(`
 *     query($owner: String!, $name: String!) {
 *        repository(owner: "owner", name: $name) {
 *          issues(first: 1) {
 *            nodes {
 *              number
 *              state
 *            }
 *          }
 *          pageInfo {
 *            endCursor
 *            startCursor
 *            hasNextPage
 *            hasPreviousPage
 *          }
 *        }
 *      }
 *  `,
 *  {
 *    edges: (issues: Issues) => issues.repository.issues.nodes,
 *    node: (edge) => edge,
 *    pageInfo: (issues) => issues.repository.issues.pageInfo,
 *    cursor: (pageInfo) => pageInfo.hasNextPage ? pageInfo.endCursor : null,
 *  },
 *  { owner: "owner", name: "name" });
 *  console.log(issues);
 * }
 * ```
 */
export function graphqlClient(
  url: string,
  options?: GraphQLClientOptions,
): GraphQLClient {
  const client = new Client({
    url,
    exchanges: [cacheExchange, retryExchange({}), fetchExchange],
    fetchOptions: () => {
      return {
        headers: {
          ...options?.token && { "Authorization": `Bearer ${options.token}` },
        },
      };
    },
  });
  return {
    async query<Result>(
      query: string,
      variables: Record<string, unknown> = {},
    ): Promise<Result> {
      const response = await client.query(query, variables);
      if (response.error) {
        throw new RequestError(response.error.message, response.data.status);
      }
      return response.data as Result;
    },
    async queryPaginated<Result, Node, Edge, PageInfo>(
      query: string,
      paginator: GraphQLPaginator<Result, Node, Edge, PageInfo>,
      variables: AnyVariables & { cursor?: string; limit?: number } = {},
    ): Promise<Node[]> {
      const nodes: Node[] = [];
      let cursor: string | null = null;
      do {
        // deno-lint-ignore no-await-in-loop
        const data = await this.query<Result>(query, { ...variables, cursor });
        const edges = paginator.edges(data);
        nodes.push(...edges.map(paginator.node));
        const pageInfo = paginator.pageInfo(data);
        cursor = paginator.cursor(pageInfo);
      } while (
        cursor &&
        (variables.limit === undefined || nodes.length < variables.limit)
      );
      return nodes;
    },
  };
}
