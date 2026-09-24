import { createRoot } from "react-dom/client";
import * as React from "react";
import App from "./App";
import FitnessApp from "./FitnessApp";
import AdminApp from "./AdminApp";
import "./style.css";
import "./fitness.css";

function CreatorGateway() {
  const [creator, setCreator] = React.useState<
    import("../shared/types").Creator | null
  >(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    const slug =
      location.pathname.match(/^\/creator\/([a-z0-9-]+)/)?.[1] ||
      new URLSearchParams(location.search).get("creator") ||
      "anyone-can-cook-demo";
    fetch(`/api/${encodeURIComponent(slug)}/config`)
      .then((r) => {
        if (!r.ok) throw new Error("Creator not found");
        return r.json() as Promise<import("../shared/types").Creator>;
      })
      .then(setCreator)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <main role="alert">{error}</main>;
  if (!creator) return <main>Loading creator PWA…</main>;
  if (creator.category === "fitness") {
    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute("href", `/api/${creator.slug}/manifest.webmanifest`);
    document
      .querySelector('link[rel="icon"]')
      ?.setAttribute("href", `/api/${creator.slug}/fitness-icon.svg`);
    document
      .querySelector('link[rel="apple-touch-icon"]')
      ?.setAttribute("href", `/api/${creator.slug}/fitness-icon.svg`);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", creator.brand.accent);
    document
      .querySelector('meta[name="apple-mobile-web-app-title"]')
      ?.setAttribute("content", creator.name);
  }
  return creator.category === "fitness" ? (
    <FitnessApp creator={creator} />
  ) : (
    <App />
  );
}

createRoot(document.getElementById("root")!).render(
  location.pathname.startsWith("/admin") ? <AdminApp /> : <CreatorGateway />,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js?v=4").catch(() => undefined);
