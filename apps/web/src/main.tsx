import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Provider as ZenStackHooksProvider } from "@zenstackhq/tanstack-query/runtime-v5/react";
import App from "./App.tsx";
import { AuthProvider } from "./auth/AuthProvider";
import { SetupScreen } from "./pages/SetupScreen";
import { authedFetch, ZENSTACK_ENDPOINT } from "./lib/api";
import { env } from "./lib/env";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    {env.configured ? (
      <QueryClientProvider client={queryClient}>
        <ZenStackHooksProvider value={{ endpoint: ZENSTACK_ENDPOINT, fetch: authedFetch }}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ZenStackHooksProvider>
      </QueryClientProvider>
    ) : (
      <SetupScreen />
    )}
  </React.StrictMode>,
);
