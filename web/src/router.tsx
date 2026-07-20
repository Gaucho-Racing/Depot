import { createBrowserRouter, Navigate } from "react-router-dom"

import { AppShell } from "@/components/AppShell"
import { RequireAuth } from "@/components/RequireAuth"
import BucketDetailsPage from "@/pages/BucketDetailsPage"
import BucketsPage from "@/pages/BucketsPage"
import DashboardPage from "@/pages/DashboardPage"
import LoginPage from "@/pages/LoginPage"
import NotFoundPage from "@/pages/NotFoundPage"
import SearchPage from "@/pages/SearchPage"
import SettingsPage from "@/pages/SettingsPage"

export const router = createBrowserRouter([
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/buckets", element: <BucketsPage /> },
          { path: "/buckets/:bucketName", element: <BucketDetailsPage /> },
          { path: "/search", element: <SearchPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: "/auth/login", element: <LoginPage /> },
  { path: "*", element: <NotFoundPage /> },
])
