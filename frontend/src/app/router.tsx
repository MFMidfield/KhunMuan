import { createBrowserRouter } from 'react-router-dom'
import { CustomerLayout } from './layouts/CustomerLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { RequireAdmin } from './guards/RequireAdmin'
import { RouteError } from './RouteError'
import { LoginPage } from '@/features/admin/LoginPage'
import { BoardPage } from '@/features/admin/BoardPage'
import { StockPage } from '@/features/admin/StockPage'
import { NewOrderPage } from '@/features/admin/NewOrderPage'
import { MenuAdminPage } from '@/features/admin/config/MenuAdminPage'
import { StaffPage } from '@/features/admin/config/StaffPage'
import { ReportsPage } from '@/features/admin/ReportsPage'
import { OrderDetailPage } from '@/features/admin/OrderDetailPage'
import { SettingsPage } from '@/features/admin/SettingsPage'
import { HomePage } from '@/features/home/HomePage'
import { MenuPage } from '@/features/menu/MenuPage'
import { BuilderPage } from '@/features/builder/BuilderPage'
import { CartPage } from '@/features/cart/CartPage'
import { CheckoutPage } from '@/features/checkout/CheckoutPage'
import { TrackingPage } from '@/features/tracking/TrackingPage'
import { MyOrdersPage } from '@/features/tracking/MyOrdersPage'
import { SlipUploadPage } from '@/features/tracking/SlipUploadPage'

// Route table from doc 04 §1. Every entry is a real screen now — the typed
// placeholders that stood in for them through Phases 1 to 3 are gone, and so is
// the component that rendered them.
export const router = createBrowserRouter([
  {
    element: <CustomerLayout />,
    errorElement: <RouteError />,
    children: [
      // `/` is the landing page and `/menu` is the menu. The menu used to be
      // the landing page; it opened on a grid of set cards, which answers "what
      // can I buy" and nothing else — not what the shop is, not whether it is
      // open right now, not how to reach a human when something goes wrong.
      { path: '/', element: <HomePage /> },
      { path: '/menu', element: <MenuPage /> },
      { path: '/build/:setId', element: <BuilderPage /> },
      { path: '/cart', element: <CartPage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/checkout/slip/:code', element: <SlipUploadPage /> },
      { path: '/o/:code', element: <TrackingPage /> },
      { path: '/my-orders', element: <MyOrdersPage /> },
    ],
  },

  { path: '/admin/login', element: <LoginPage />, errorElement: <RouteError /> },

  {
    element: <RequireAdmin />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin', element: <BoardPage /> },
          { path: '/admin/orders/:id', element: <OrderDetailPage /> },
          { path: '/admin/new', element: <NewOrderPage /> },
          { path: '/admin/stock', element: <StockPage /> },
          // Open/close is an ordinary admin power (doc 04 §1): whoever is on
          // shift when the last tray runs out has to be able to stop the queue
          // without phoning the owner. The superadmin-only editors on this
          // screen arrive in Phase 4.
          { path: '/admin/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },

  {
    element: <RequireAdmin superadminOnly />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/menu', element: <MenuAdminPage /> },
          { path: '/admin/reports', element: <ReportsPage /> },
          { path: '/admin/staff', element: <StaffPage /> },
        ],
      },
    ],
  },

  { path: '*', element: <RouteError /> },
])
