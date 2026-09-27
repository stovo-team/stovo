import { createRoot } from "react-dom/client";
import { CallUiPreview } from "./call-ui-preview";

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("Call UI preview requires a #root element");

createRoot(rootElement).render(<CallUiPreview />);
