import { createBrowserRouter } from 'react-router-dom'
import { CustomerLayout } from './layouts/CustomerLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { RequireAdmin } from './guards/RequireAdmin'
import { Placeholder } from './Placeholder'
import { RouteError } from './RouteError'
import { LoginPage } from '@/features/admin/LoginPage'
import { BoardPage } from '@/features/admin/BoardPage'

// Route table from doc 04 §1. Screens land phase by phase; the shells are here
// from the start so the guards and navigation are exercised for real.
export const router = createBrowserRouter([
  {
    element: <CustomerLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Placeholder titleKey="menu" phase={1} /> },
      { path: '/build/:setId', element: <Placeholder titleKey="build" phase={1} /> },
      { path: '/cart', element: <Placeholder titleKey="cart" phase={1} /> },
      { path: '/checkout', element: <Placeholder titleKey="checkout" phase={1} /> },
      { path: '/checkout/slip/:code', element: <Placeholder titleKey="slip" phase={1} /> },
      { path: '/o/:code', element: <Placeholder titleKey="tracking" phase={1} /> },
      { path: '/my-orders', element: <Placeholder titleKey="myOrders" phase={1} /> },
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
          {
            path: '/admin/orders/:id',
            element: <Placeholder titleKey="orderDetail" phase={2} />,
          },
          { path: '/admin/new', element: <Placeholder titleKey="newOrder" phase={2} /> },
          { path: '/admin/stock', element: <Placeholder titleKey="stock" phase={2} /> },
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
          { path: '/admin/menu', element: <Placeholder titleKey="adminMenu" phase={4} /> },
          { path: '/admin/settings', element: <Placeholder titleKey="settings" phase={2} /> },
          { path: '/admin/reports', element: <Placeholder titleKey="reports" phase={4} /> },
          { path: '/admin/staff', element: <Placeholder titleKey="staff" phase={4} /> },
        ],
      },
    ],
  },

  { path: '*', element: <RouteError /> },
])
