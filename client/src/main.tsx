import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n/index";

createRoot(document.getElementById("root")!).render(<App />);
