import { QueryClient, defaultShouldDehydrateQuery, isServer } from '@tanstack/react-query';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1_000,       // 30 s
        gcTime: 5 * 60 * 1_000,      // 5 min
        retry: 1,
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (isServer) {
    // Always create a new client on the server
    return makeQueryClient();
  }
  // Re-use the browser client (HMR-safe)
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
