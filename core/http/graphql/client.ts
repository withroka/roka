/**
 * This module provides the {@linkcode client} function to create a
 * GraphQL client for making requests. Useful for building GraphQL-based API
 * clients.
 *
 * ```ts
 * import { client, gql } from "./client.ts";
 *
 * async function usage() {
 *   const api = client("https://api.github.com/graphql");
 *   type Repository = { owner: { login: string }; name: string };
 *   const repo = await api.query<{ repository: Repository }>(
 *     gql`
 *       query {
 *         repository(owner: "withroka", name: "roka") {
 *           owner { login },
 *           name,
 *         }
 *       }
 *     `,
 *   );
 *   console.log(repo?.repository);
 * }
 * ```
 *
 * @module client
 */

import {
  type AnyVariables,
  cacheExchange,
  Client as UrqlClient,
  type DocumentInput,
  fetchExchange,
} from "@urql/core";
import { retryExchange } from "@urql/exchange-retry";
import { RequestError } from "../request.ts";

export { gql } from "@urql/core";

/** A GraphQL client returned by the {@linkcode client} function. */
export interface Client {
  /** Makes a GraphQL query. */
  // deno-lint-ignore no-explicit-any
  query<Data = any, Variables extends AnyVariables = AnyVariables>(
    query: DocumentInput<Data, Variables>,
    variables?: Variables,
  ): Promise<Data | undefined>;
  /** Makes a paginated GraphQL query, given a {@linkcode Paginator}. */
  queryPaginated<
    Node,
    Edge,
    PageInfo,
    // deno-lint-ignore no-explicit-any
    Data = any,
    Variables extends AnyVariables = AnyVariables,
  >(
    query: DocumentInput<Data, Variables>,
    paginator: Paginator<Data, Node, Edge, PageInfo>,
    variables?: Variables,
  ): Promise<Node[]>;
}

/** Options for the {@linkcode client} function. */
export interface ClientOptions {
  /** The bearer token to be sent with the request headers. */
  token?: string;
}

/** A GraphQL paginator that traverses response data to generate pages.
 *
 * A custom paginator is needed by {@linkcode Client.queryPaginated} for
 * nodes it is querying.
 */
export interface Paginator<Data, Node, Edge, PageInfo> {
  /** Extracts edges from the response data. */
  edges(data: Data): Edge[];
  /** Extracts nodes from an edge. */
  node(edge: Edge): Node;
  /** Extracts an object that contains page and cursor information. */
  pageInfo(data: Data): PageInfo;
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
 * import { client } from "@roka/http/graphql/client";
 *
 * interface Repository {
 *   owner: string;
 *   name: string;
 *   description: string;
 * }
 *
 * async function usage() {
 *   const api = client("https://api.github.com/graphql");
 *   const { repository } = await api.query(
 *     `
 *     query($owner: String!, $name: String!) {
 *       repository(owner: $owner, name: $name) {
 *         description
 *       }
 *    }
 *  `,
 *     { owner: "owner", name: "repo" },
 *   );
 *   console.log(repository.description);
 * }
 * ```
 *
 * @example Make a paginated GraphQL query.
 * ```ts
 * import { client } from "@roka/http/graphql/client";
 *
 * interface Issue {
 *   number: number;
 *   title: string;
 *   state: string;
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
 *   const api = client("https://api.github.com/graphql");
 *   const issues: Issue[] = await api.queryPaginated(
 *     `
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
 *     {
 *       edges: (issues: Issues) => issues.repository.issues.nodes,
 *       node: (edge) => edge,
 *       pageInfo: (issues) => issues.repository.issues.pageInfo,
 *       cursor: (pageInfo) => pageInfo.hasNextPage ? pageInfo.endCursor : null,
 *     },
 *     { owner: "owner", name: "name" },
 *   );
 *   console.log(issues);
 * }
 * ```
 */
export function client(url: string | URL, options?: ClientOptions): Client {
  if (typeof url === "string") url = new URL(url);
  const client = new UrqlClient({
    url: url.toString(),
    preferGetMethod: false,
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
    async query<Data, Variables>(
      query: DocumentInput<Data, Variables>,
      variables?: Variables,
    ): Promise<Data | undefined> {
      const response = await client.query(query, variables ?? {});
      if (response.error) {
        throw new RequestError(response.error.message, {
          status: response instanceof Response ? response.status : -1,
          cause: response.error,
        });
      }
      return response.data;
    },
    async queryPaginated<
      Node,
      Edge,
      PageInfo,
      Data,
      Variables extends AnyVariables,
    >(
      query: DocumentInput<Data, Variables>,
      paginator: Paginator<Data, Node, Edge, PageInfo>,
      variables: Variables & { cursor?: string; limit?: number },
    ): Promise<Node[]> {
      const nodes: Node[] = [];
      let cursor: string | null = null;
      do {
        // deno-lint-ignore no-await-in-loop
        const data = await this.query<Data, Variables>(query, {
          ...variables,
          cursor,
        });
        if (data !== undefined) {
          const edges = paginator.edges(data);
          nodes.push(...edges.map(paginator.node));
          const pageInfo = paginator.pageInfo(data);
          cursor = paginator.cursor(pageInfo);
        } else {
          cursor = null;
        }
      } while (
        cursor &&
        (variables.limit === undefined || nodes.length < variables.limit)
      );
      return nodes;
    },
  };
}
