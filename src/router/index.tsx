import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

const Home = lazy(() => import("@/pages/Home"));
const Versions = lazy(() => import("@/pages/Versions"));
const VersionDetail = lazy(() => import("@/pages/VersionDetail"));
const Mods = lazy(() => import("@/pages/Mods"));
const ModDetail = lazy(() => import("@/pages/ModDetail"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const Settings = lazy(() => import("@/pages/Settings"));
const SkinPreviewPage = lazy(() => import("@/pages/SkinPreviewPage"));

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <LazyPage><Home /></LazyPage>,
      },
      {
        path: "versions",
        element: <LazyPage><Versions /></LazyPage>,
      },
      {
        path: "versions/:id",
        element: <LazyPage><VersionDetail /></LazyPage>,
      },
      {
        path: "mods",
        element: <LazyPage><Mods /></LazyPage>,
      },
      {
        path: "mods/:id",
        element: <LazyPage><ModDetail /></LazyPage>,
      },
      {
        path: "accounts",
        element: <LazyPage><Accounts /></LazyPage>,
      },
      {
        path: "settings",
        element: <LazyPage><Settings /></LazyPage>,
      },
    ],
  },
  // 独立全屏页面（无侧边栏）
  {
    path: "/skin-preview",
    element: <LazyPage><SkinPreviewPage /></LazyPage>,
  },
]);
