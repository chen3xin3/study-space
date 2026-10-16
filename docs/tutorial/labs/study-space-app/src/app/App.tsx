import type { ReactNode } from "react";
import { BrowserRouter, MemoryRouter, NavLink, Route, Routes } from "react-router";
import { DashboardPage } from "../pages/DashboardPage";
import { MaterialsPage } from "../pages/MaterialsPage";
import { FocusPage } from "../pages/FocusPage";
import { PhotosPage } from "../pages/PhotosPage";

type AppProps = { initialEntries?: string[] };

const navigation = [
  { to: "/", label: "首页", icon: "⌂", end: true },
  { to: "/focus", label: "专注学习", icon: "◷" },
  { to: "/materials", label: "学习资料", icon: "▤" },
  { to: "/photos", label: "学习照片", icon: "▧" },
];

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="placeholder-page">
      <p className="eyebrow">从零实现学习空间</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

function AppRoutes() {
  return (
    <div className="app-shell">
      <aside className="app-sidebar" data-testid="app-sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">学</span>
          <span><strong>学习空间</strong><small>专注当下，稳步积累</small></span>
        </div>
        <nav aria-label="主导航" className="main-navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-note">教学版 · 第 32 章</p>
      </aside>
      <main className="app-content" data-testid="app-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/photos" element={<PhotosPage />} />
        </Routes>
      </main>
    </div>
  );
}

export function App({ initialEntries }: AppProps) {
  const content: ReactNode = <AppRoutes />;
  return initialEntries
    ? <MemoryRouter initialEntries={initialEntries}>{content}</MemoryRouter>
    : <BrowserRouter>{content}</BrowserRouter>;
}
