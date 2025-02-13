import { request } from "@roka/http/request";

/** A client for making JSON-based HTTP requests. */
export class JsonClient {
  /**
   * Creates an instance of the JsonClient with the specified URL and options.
   *
   * @param url The base URL to which the requests are made.
   * @param options Parameters for the requests.
   * @param options.token Optional token for authentication.
   * @param options.referrer Optional referrer for the requests.
   */
  constructor(
    private url: string,
    private options: { token?: string; referrer?: string } = {},
  ) {}

  /**
   * Sends a GET request to the specified path.
   *
   * @template T The expected response type.
   * @param path The path to which the GET request is made.
   * @returns The response data.
   */
  async get<T>(path: string): Promise<T> {
    const { response } = await request<T>(`${this.url}${path}`, {
      headers: {
        "Accept": "application/json; charset=UTF-8",
      },
      ...this.options,
    });
    return await response.json();
  }

  /**
   * Sends a POST request to the specified path with the provided body.
   *
   * @template T The expected response type.
   * @param path The path to which the POST request is made.
   * @param body The body of the POST request.
   * @returns The response data.
   */
  async post<T>(path: string, body: object): Promise<T> {
    const { response } = await request<T>(`${this.url}${path}`, {
      method: "POST",
      headers: {
        "Accept": "application/json; charset=UTF-8",
        "Content-Type": "application/json; charset=UTF-8",
      },
      body,
      ...this.options,
    });
    return await response.json();
  }

  /**
   * Sends a DELETE request to the specified path.
   *
   * @template T The expected response type.
   * @param path The path to which the DELETE request is made.
   * @returns The response data.
   */
  async delete<T>(path: string): Promise<T> {
    const { response } = await request<T>(`${this.url}${path}`, {
      method: "DELETE",
      headers: {
        "Accept": "application/json; charset=UTF-8",
      },
      ...this.options,
    });
    return await response.json();
  }
}
