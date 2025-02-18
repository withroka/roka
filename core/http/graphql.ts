/**
 * GraphQL over HTTP. Useful for building GraphQL based API clients.
 *
 * @module
 */

import { RequestError } from "@roka/http/request";
import {
  type AnyVariables,
  cacheExchange,
  Client,
  fetchExchange,
} from "@urql/core";
import { retryExchange } from "@urql/exchange-retry";

/** A GraphQL client returned by {@linkcode client}. */
export interface GraphQLClient {
  /** Makes a GraphQL query. */
  query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T>;
  /** Makes a paginated GraphQL query, given a {@linkcode GraphQLPaginator}. */
  queryPaginated<T, Node, Edge, PageInfo>(
    query: string,
    paginator: GraphQLPaginator<T, Node, Edge, PageInfo>,
    variables?: Record<string, unknown>,
  ): Promise<Node[]>;
}

/** Options for {@linkcode client}. */
export interface GraphQLClientOptions {
  /** The bearer token to be sent with the request headers. */
  token?: string;
}

/** A GraphQL paginator taht traverses response data to generate pages. */
export interface GraphQLPaginator<T, Node, Edge, PageInfo> {
  /** Extracts edges from the response data. */
  edges(data: T): Edge[];
  /** Extracts nodes from an edge. */
  node(edge: Edge): Node;
  /** Extracts an object that contains page and cursor information. */
  pageInfo(data: T): PageInfo;
  /**
   * Extracts the cursor for the next page from page information.
   *
   * This function must return `null` if there are no more pages.
   */
  cursor(pageInfo: PageInfo): string | null;
}

/** Creates an HTTP client for making GraphQL requests. */
export function client(
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
    async query<T>(
      query: string,
      variables: Record<string, unknown> = {},
    ): Promise<T> {
      const response = await client.query(query, variables);
      if (response.error) {
        throw new RequestError(response.error.message, response.data.status);
      }
      return response.data as T;
    },
    async queryPaginated<T, Node, Edge, PageInfo>(
      query: string,
      paginator: GraphQLPaginator<T, Node, Edge, PageInfo>,
      variables: AnyVariables & { cursor?: string; limit?: number } = {},
    ): Promise<Node[]> {
      const nodes: Node[] = [];
      let cursor: string | null = null;
      do {
        const data = await this.query<T>(query, { ...variables, cursor });
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
