import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "../layouts/AppShell";
import { SettingsProvider } from "../services/settings/SettingsProvider";
import { RouteSession } from "./RouteSession";

const DashboardPage = lazy(() => import("../pages/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const InboxWorkspacePage = lazy(() => import("../pages/inbox/InboxWorkspacePage").then((module) => ({ default: module.InboxWorkspacePage })));
const SettingsPage = lazy(() => import("../pages/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const StatisticsPage = lazy(() => import("../pages/statistics/StatisticsPage").then((module) => ({ default: module.StatisticsPage })));
const SubjectPage = lazy(() => import("../pages/subjects/SubjectPage").then((module) => ({ default: module.SubjectPage })));
const WordEditorPage = lazy(() => import("../pages/english/WordEditorPage").then((module) => ({ default: module.WordEditorPage })));
const WordLibraryPage = lazy(() => import("../pages/english/WordLibraryPage").then((module) => ({ default: module.WordLibraryPage })));
const WordReviewPage = lazy(() => import("../pages/english/WordReviewPage").then((module) => ({ default: module.WordReviewPage })));
const EssayLibraryPage = lazy(() => import("../pages/english/EssayLibraryPage").then((module) => ({ default: module.EssayLibraryPage })));
const EssayEditorPage = lazy(() => import("../pages/english/EssayEditorPage").then((module) => ({ default: module.EssayEditorPage })));
const EnglishDashboard = lazy(() => import("../pages/english/EnglishDashboard").then((module) => ({ default: module.EnglishDashboard })));
const VocabularyImportPage = lazy(() => import("../pages/english/VocabularyImportPage").then((module) => ({ default: module.VocabularyImportPage })));
const VocabularyImportReviewPage = lazy(() => import("../pages/english/VocabularyImportReviewPage").then((module) => ({ default: module.VocabularyImportReviewPage })));
const EssayImportPage = lazy(() => import("../pages/english/EssayImportPage").then((module) => ({ default: module.EssayImportPage })));
const EssayAttemptHistoryPage = lazy(() => import("../pages/english/EssayAttemptHistoryPage").then((module) => ({ default: module.EssayAttemptHistoryPage })));
const EssayAttemptEditorPage = lazy(() => import("../pages/english/EssayAttemptEditorPage").then((module) => ({ default: module.EssayAttemptEditorPage })));
const PhotoArchivePage = lazy(() => import("../pages/photos/PhotoArchivePage").then((module) => ({ default: module.PhotoArchivePage })));
const FocusPage = lazy(() => import("../pages/focus/FocusPage").then((module) => ({ default: module.FocusPage })));
const LibraryPage = lazy(() => import("../pages/library/LibraryPage").then((module) => ({ default: module.LibraryPage })));
const AiOrganizationWorkbenchPage = lazy(() => import("../pages/library/organization/AiOrganizationWorkbenchPage").then((module) => ({ default: module.AiOrganizationWorkbenchPage })));
const StudyWorkspacePage = lazy(() => import("../pages/study/StudyWorkspacePage").then((module) => ({ default: module.StudyWorkspacePage })));
const StudyItemEditorPage = lazy(() => import("../pages/study/StudyItemEditorPage").then((module) => ({ default: module.StudyItemEditorPage })));
const MathWrongQuestionReviewPage = lazy(() => import("../pages/study/MathWrongQuestionReviewPage").then((module) => ({ default: module.MathWrongQuestionReviewPage })));

function deferred(element: ReactNode) {
  return <Suspense fallback={<div role="status" aria-label="正在打开页面" className="route-loading">正在打开页面…</div>}>{element}</Suspense>;
}

export function App() {
  return (
    <SettingsProvider>
      <RouteSession />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={deferred(<DashboardPage />)} />
          <Route path="english" element={deferred(<EnglishDashboard />)} />
          <Route path="focus" element={deferred(<FocusPage />)} />
          <Route path="english/words/new" element={<Navigate to="/english/words/import" replace />} />
          <Route path="english/words/import" element={deferred(<VocabularyImportPage />)} />
          <Route path="english/words/import/:sessionId" element={deferred(<VocabularyImportReviewPage />)} />
          <Route path="english/words" element={deferred(<WordLibraryPage />)} />
          <Route path="english/words/:wordId" element={deferred(<WordEditorPage />)} />
          <Route path="english/review" element={deferred(<WordReviewPage />)} />
          <Route path="english/essays" element={deferred(<EssayLibraryPage />)} />
          <Route path="english/essays/new" element={<Navigate to="/english/essays/import" replace />} />
          <Route path="english/essays/import" element={deferred(<EssayImportPage />)} />
          <Route path="english/essays/import/:draftId" element={deferred(<EssayImportPage />)} />
          <Route path="english/essays/history" element={deferred(<EssayAttemptHistoryPage />)} />
          <Route path="english/essays/history/:attemptId" element={deferred(<EssayAttemptEditorPage />)} />
          <Route path="english/essays/:essayId" element={deferred(<EssayEditorPage />)} />
          <Route path="math" element={deferred(<SubjectPage subject="math" />)} />
          <Route path="specialty" element={deferred(<SubjectPage subject="specialty" />)} />
          <Route path="politics" element={deferred(<SubjectPage subject="politics" />)} />
          <Route path="statistics" element={deferred(<StatisticsPage />)} />
          <Route path="library" element={deferred(<LibraryPage />)} />
          <Route path="library/organize" element={deferred(<AiOrganizationWorkbenchPage />)} />
          <Route path="library/photos" element={deferred(<PhotoArchivePage />)} />
          <Route path="library/files" element={deferred(<InboxWorkspacePage />)} />
          <Route path="photos" element={<Navigate to="/library/photos" replace />} />
          <Route path="inbox" element={<Navigate to="/library/files" replace />} />
          <Route path="settings" element={deferred(<SettingsPage />)} />
          <Route path="study/:subject/:collection" element={deferred(<StudyWorkspacePage />)} />
          <Route path="study/:subject/:collection/new" element={deferred(<StudyItemEditorPage />)} />
          <Route path="study/math/wrong-questions/:itemId/review" element={deferred(<MathWrongQuestionReviewPage />)} />
          <Route path="study/:subject/:collection/:itemId" element={deferred(<StudyItemEditorPage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SettingsProvider>
  );
}
