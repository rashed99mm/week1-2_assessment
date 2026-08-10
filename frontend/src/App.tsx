import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Layout } from './components/layout/Layout'
import { Spinner } from './components/ui/Button'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { LandingPage } from './pages/LandingPage'
import { EventsPage } from './pages/events/EventsPage'
import { EventDetailPage } from './pages/events/EventDetailPage'
import { SeatBookingPage } from './pages/events/SeatBookingPage'
import { CheckoutPage } from './pages/events/CheckoutPage'
import { OrdersPage } from './pages/orders/OrdersPage'
import { OrderDetailPage } from './pages/orders/OrderDetailPage'
import { AdminEventsPage } from './pages/admin/AdminEventsPage'
import { AdminTicketTypesPage } from './pages/admin/AdminTicketTypesPage'
import type { ReactNode } from 'react'

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page text-accent">
      <Spinner className="size-10" />
    </div>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (user) {
    const redirect = new URLSearchParams(window.location.search).get('redirect')
    return <Navigate to={redirect && redirect.startsWith('/') ? redirect : '/'} replace />
  }
  return <>{children}</>
}

function OutletInner() {
  return <Outlet />
}

export default function App() {  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestOnly>
                <LoginPage />
              </GuestOnly>
            }
          />
          <Route
            path="/register"
            element={
              <GuestOnly>
                <RegisterPage />
              </GuestOnly>
            }
          />
          <Route element={<Layout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/events/:id/seats" element={<SeatBookingPage />} />
            <Route
              element={
                <Protected>
                  <OutletInner />
                </Protected>
              }
            >
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
              <Route path="/admin/events" element={<AdminEventsPage />} />
              <Route path="/admin/ticket-types" element={<AdminTicketTypesPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
