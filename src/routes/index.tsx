import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { KitchenApp } from "../ui/app";
export const Route = createFileRoute("/")({ component: Index });
function Index() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15000, retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <KitchenApp />
    </QueryClientProvider>
  );
}
