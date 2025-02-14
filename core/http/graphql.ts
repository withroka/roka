import { RequestError } from "@roka/http";
import {
  type AnyVariables,
  cacheExchange,
  Client,
  fetchExchange,
} from "@urql/core";
import { retryExchange } from "@urql/exchange-retry";

/** A GraphQL client for making queries and handling pagination. */
export class GraphQLClient {
  private client;

  /**
   * Creates an instance of GraphQLClient.
   *
   * @param url The URL of the GraphQL endpoint.
   * @param options Configuration options.
   * @param options.token Optional authorization token.
   */
  constructor(url: string, options: { token?: string } = {}) {
    this.client = new Client({
      url,
      exchanges: [cacheExchange, retryExchange({}), fetchExchange],
      fetchOptions: () => {
        return {
          headers: {
            ...(options.token
              ? { "Authorization": `Bearer ${options.token}` }
              : {}),
          },
        };
      },
    });
  }

  /**
   * Make a GraphQL query.
   *
   * @param queryPaths An array of paths to the GraphQL query files.
   * @param variables Optional variables for the query.
   * @returns The query result.
   * @throws {RequestError} If the query fails.
   */
  async query<T>(
    queryPaths: string[],
    variables: AnyVariables = {},
  ): Promise<T> {
    const query = (await Promise.all(
      queryPaths.map(async (path) =>
        await Deno.readTextFile(
          new URL(`${path}.graphql`, Deno.mainModule),
        )
      ),
    )).join("\n");
    const response = await this.client.query(query, variables);
    if (response.error) {
      throw new RequestError(response.error.message);
    }
    return response.data as T;
  }

  /**
   * Make a paginated GraphQL query.
   *
   * @param queryPaths An array of paths to the GraphQL query files.
   * @param getEdges A function to extract edges from the query result.
   * @param getCursor A function to extract the cursor from the query result.
   */
  async queryPaginated<T, U>(
    queryPaths: string[],
    getEdges: (data: T) => { edges: { node: U }[] },
    getCursor: (data: T) => string | null,
    variables: AnyVariables & { cursor?: string; limit?: number } = {},
  ): Promise<U[]> {
    let nodes: U[] = [];
    let cursor: string | null = null;
    do {
      const data = await this.query<T>(queryPaths, { ...variables, cursor });
      nodes = nodes.concat(getEdges(data).edges.map((edge) => edge.node));
      cursor = getCursor(data);
    } while (
      cursor &&
      (variables.limit === undefined || nodes.length < variables.limit)
    );
    return nodes;
  }
}
