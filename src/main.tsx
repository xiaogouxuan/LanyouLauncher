import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// 屏蔽 WebView 的默认右键菜单，仅保留输入框内的复制/粘贴菜单
document.addEventListener("contextmenu", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable='true']")) return;
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);