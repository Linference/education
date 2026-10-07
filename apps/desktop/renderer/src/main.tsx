// 格致渲染进程入口
import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./workbench.css";
import "./learning.css";
import './companion-rooms.css';
import './competition.css';
import './motion.css';
import './demo-english';
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
