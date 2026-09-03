import { createBrowserRouter, Navigate } from "react-router-dom"

import { AppShell } from "@/components/AppShell"
import { RequireAuth } from "@/components/RequireAuth"
import AttributionDetailsPage from "@/pages/AttributionDetailsPage"
import BucketDetailsPage from "@/pages/BucketDetailsPage"
import BucketsPage from "@/pages/BucketsPage"
import CostExplorerPage from "@/pages/CostExplorerPage"
import EditBucketPage from "@/pages/EditBucketPage"
import DashboardPage from "@/pages/DashboardPage"
import LoginPage from "@/pages/LoginPage"
import NewBucketPage from "@/pages/NewBucketPage"
import NotFoundPage from "@/pages/NotFoundPage"
import SettingsPage from "@/pages/SettingsPage"
import StorageBackendsPage from "@/pages/StorageBackendsPage"

export const router = createBrowserRouter([
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/cost-explorer", element: <CostExplorerPage /> },
          { path: "/uploaders/:entityID", element: <AttributionDetailsPage kind="uploader" /> },
          {
            path: "/applications/:clientID",
            element: <AttributionDetailsPage kind="application" />,
          },
          { path: "/buckets", element: <BucketsPage /> },
          { path: "/buckets/new", element: <NewBucketPage /> },
          { path: "/buckets/:bucketName", element: <BucketDetailsPage /> },
          { path: "/buckets/:bucketName/edit", element: <EditBucketPage /> },
          { path: "/search", element: <Navigate to="/dashboard" replace /> },
          { path: "/storage-backends", element: <StorageBackendsPage /> },
          {
            path: "/api-docs",
            lazy: async () => {
              const { default: Component } = await import("@/pages/ApiDocumentationPage")
              return { Component }
            },
          },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: "/auth/login", element: <LoginPage /> },
  { path: "*", element: <NotFoundPage /> },
])
