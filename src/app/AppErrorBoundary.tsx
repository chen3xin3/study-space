import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, Home, RotateCw } from "lucide-react";
import { Link, useLocation } from "react-router";

interface Props { children: ReactNode; }
interface BoundaryProps extends Props { resetKey: string; }
interface State { hasError: boolean; }

class RouteErrorBoundary extends Component<BoundaryProps, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error("Application render failed", error, info);
  }

  componentDidUpdate(previous: BoundaryProps) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="fatal-error">
        <span><CircleAlert aria-hidden="true" size={30} /></span>
        <h1>页面暂时无法显示</h1>
        <p>你的学习资料没有被修改。可以返回首页，或重新加载应用再试一次。</p>
        <div><Link className="primary-button" to="/"><Home aria-hidden="true" size={17} />返回首页</Link><button className="secondary-button" type="button" onClick={() => window.location.reload()}><RotateCw aria-hidden="true" size={17} />重新加载</button></div>
      </main>
    );
  }
}

export function AppErrorBoundary({ children }: Props) {
  const location = useLocation();
  return <RouteErrorBoundary resetKey={location.pathname}>{children}</RouteErrorBoundary>;
}
