import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { migrateStoreStorage } from "./storage.js";
import "./styles.css";
import "./super-admin/styles/catalog.css";
import "./theme.css";
import "./super-admin/styles/catalog-theme.css";
import "./ui-refinements.css";
import "./super-admin/styles/catalog-refinements.css";
import "./navigation.css";
import "./commerce.css";
import "./super-admin/styles/commerce-tools.css";
import "./marketplace.css";
import "./storefront.css";
import "./brand.css";

migrateStoreStorage(window.localStorage);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
