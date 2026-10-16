import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./app.css";

const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error("找不到 React 挂载节点 #root");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </StrictMode>,
);
