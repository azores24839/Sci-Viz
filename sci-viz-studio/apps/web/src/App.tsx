import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';
import { FeedbackWidget } from './features/feedback/FeedbackWidget';
import { Help } from './pages/Help';
import { Projects } from './pages/Projects';
import { ReviewPage } from './pages/ReviewPage';
import { Studio } from './pages/Studio';
import './styles/studio-core.css';
import './styles/studio-benchmarks.css';
import './styles/studio-projects.css';
import './styles/studio-agents.css';
import './styles/studio-plans.css';
import './styles/studio-reviews.css';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<StudioRoute />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/review/:token" element={<ReviewPageRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

function ProjectsPage() {
  return (
    <>
      <Projects />
      <FeedbackWidget context={{ page: '项目列表' }} />
    </>
  );
}

function StudioRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return <main className="app-loading"><strong>无效的项目地址</strong><span>请从项目列表中选择一个项目。</span></main>;
  return (
    <Studio projectId={projectId} />
  );
}

function HelpPage() {
  return (
    <>
      <Help />
      <FeedbackWidget context={{ page: '帮助中心' }} />
    </>
  );
}

function ReviewPageRoute() {
  return <ReviewPage />;
}
