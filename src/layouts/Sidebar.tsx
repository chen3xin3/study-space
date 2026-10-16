import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavLink } from "react-router";
import { useSettings } from "../services/settings/SettingsProvider";
import { navigationGroups } from "./navigation";

export function Sidebar() {
  const { settings, updateSettings } = useSettings();

  return (
    <aside className="sidebar" data-collapsed={settings.sidebarCollapsed} data-testid="app-sidebar">
      <nav className="sidebar__nav" aria-label="主导航">
        {navigationGroups.map((group) => (
          <section className="nav-group" aria-labelledby={`nav-group-${group.key}`} key={group.key}>
            <h2 id={`nav-group-${group.key}`} className="nav-group__label">{group.label}</h2>
            {group.items.map(({ to, label, key, tone, icon: Icon }) => (
              <NavLink
                key={key}
                to={to}
                end={to === "/"}
                aria-label={label}
                title={settings.sidebarCollapsed ? label : undefined}
                className={({ isActive }) => `nav-item nav-item--${key} nav-item--tone-${tone}${isActive ? " is-active" : ""}`}
              >
                <span className="nav-item__icon"><Icon aria-hidden="true" size={18} /></span>
                <span className="nav-item__label">{label}</span>
                <span className="nav-item__active-dot" aria-hidden="true" />
              </NavLink>
            ))}
          </section>
        ))}
      </nav>
      <button
        className="sidebar__toggle"
        type="button"
        aria-label={settings.sidebarCollapsed ? "展开导航" : "收起导航"}
        onClick={() => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })}
      >
        {settings.sidebarCollapsed ? <ChevronRight aria-hidden="true" size={18} /> : <ChevronLeft aria-hidden="true" size={18} />}
        <span>{settings.sidebarCollapsed ? "展开" : "收起导航"}</span>
      </button>
    </aside>
  );
}
