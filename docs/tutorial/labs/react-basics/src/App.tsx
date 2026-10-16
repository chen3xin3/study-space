import { NavLink, Navigate, Outlet, Route, Routes } from "react-router";
import { LearningNotesPage } from "./pages/LearningNotesPage";
import { TasksPage } from "./pages/TasksPage";
import { InMemoryTaskService } from "./services/in-memory-task-service";
import type { TaskService } from "./services/task-service";

const defaultService = new InMemoryTaskService();

function ApplicationShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span aria-hidden="true">学</span>
          <div><strong>学习实验室</strong><small>React 基础</small></div>
        </div>
        <nav aria-label="实验导航">
          <NavLink to="/tasks">任务</NavLink>
          <NavLink to="/notes">笔记</NavLink>
        </nav>
      </aside>
      <div className="main-scroll"><Outlet /></div>
    </div>
  );
}

interface AppProps {
  service?: TaskService;
}

export function App({ service = defaultService }: AppProps) {
  return (
    <Routes>
      <Route element={<ApplicationShell />}>
        <Route index element={<Navigate to="/tasks" replace />} />
        <Route path="/tasks" element={<TasksPage service={service} />} />
        <Route path="/notes" element={<LearningNotesPage />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Route>
    </Routes>
  );
}
