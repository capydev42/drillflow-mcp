/** Everything the server is configured with — two environment variables. */
export interface Config {
  apiUrl: string;
  /** A C2 API token, or undefined: the server then publishes ANONYMOUSLY, and
   *  every publish result says so. Silence there would hand an agent a link
   *  that dies in 90 days while it believes the account owns it. */
  token?: string;
}

export const DEFAULT_API_URL = 'https://api.drillflow.de';

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.DRILLFLOW_TOKEN?.trim();
  return {
    apiUrl: (env.DRILLFLOW_API_URL?.trim() || DEFAULT_API_URL).replace(/\/$/, ''),
    token: token || undefined,
  };
}
