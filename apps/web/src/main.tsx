import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { i18nReady } from "./i18n";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/dots.css";
import "./styles/starbattle.css";
import "./styles/chess.css";
import "./styles/checkers.css";
import "./styles/dominoes.css";
import "./styles/sputnik.css";
import "./styles/torpedo.css";

// A theme before the first paint: the home app's stored one if this device has
// it, else the dark default — the session applies the member's own once known.
try {
  const theme = localStorage.getItem("isputnik-games-theme");
  if (theme) document.documentElement.dataset.theme = theme;
} catch {
  /* private mode */
}

void i18nReady.then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
