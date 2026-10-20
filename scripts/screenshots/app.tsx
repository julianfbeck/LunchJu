import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KitchenApp } from "../../src/ui/app";
import { LanguageProvider } from "../../src/ui/language";
import { PwaProvider } from "../../src/ui/pwa";
import "../../src/styles.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
  },
});

// The preview server supplies fictional data through the normal API paths.
// Production components and styling are used without visual overrides.
createRoot(document.getElementById("root")!).render(
  <LanguageProvider initialLanguage="de">
    <PwaProvider>
      <QueryClientProvider client={client}>
        <KitchenApp />
      </QueryClientProvider>
    </PwaProvider>
  </LanguageProvider>,
);
