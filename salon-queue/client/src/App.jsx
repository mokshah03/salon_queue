import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SelectionProvider } from './modules/customer/SelectionContext.jsx';
import ServicesPage from './modules/customer/ServicesPage.jsx';
import CheckInPage from './modules/customer/CheckInPage.jsx';
import QueueStatusPage from './modules/customer/QueueStatusPage.jsx';
import StaffQueuePage from './modules/staff/StaffQueuePage.jsx';
import DisplayPage from './modules/display/DisplayPage.jsx';
import AdminPage from './modules/admin/AdminPage.jsx';
import { StateMessage } from './components/ui.jsx';

const DEV_LINKS = [
  ['/', 'Customer'],
  ['/staff/queue', 'Staff'],
  ['/display', 'Display'],
  ['/admin', 'Admin'],
];

// Development-only screen switcher. It is not included in production builds
// and is never shown on the waiting-room display.
function DevSwitcher() {
  const { pathname } = useLocation();
  if (!import.meta.env.DEV || pathname === '/display') return null;
  return (
    <nav className="devnav" aria-label="Developer screen switcher">
      <span>DEV</span>
      {DEV_LINKS.map(([to, label]) => (
        <Link key={to} to={to} className={pathname === to ? 'active' : ''}>{label}</Link>
      ))}
    </nav>
  );
}

function NotFound() {
  return (
    <StateMessage title="Page not found" action={<Link className="btn btn--primary" to="/">Go to services</Link>}>
      That page doesn't exist.
    </StateMessage>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SelectionProvider>
        <DevSwitcher />
        <Routes>
          <Route path="/" element={<ServicesPage />} />
          <Route path="/check-in" element={<CheckInPage />} />
          <Route path="/queue/:id" element={<QueueStatusPage />} />
          <Route path="/staff" element={<Navigate to="/staff/queue" replace />} />
          <Route path="/staff/queue" element={<StaffQueuePage />} />
          <Route path="/display" element={<DisplayPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SelectionProvider>
    </BrowserRouter>
  );
}
