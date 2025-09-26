import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import FlightDetail from "./components/FlightDetail";
import Toaster from "./components/ui/Toaster";
import "./index.css";

const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/flight/:id", element: <FlightDetail /> },
  { path: "/brief", element: <FlightDetail /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster />
  </React.StrictMode>
);
