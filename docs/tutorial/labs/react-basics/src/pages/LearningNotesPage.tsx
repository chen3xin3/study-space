export function LearningNotesPage() {
  return (
    <main className="page-content">
      <p className="eyebrow">学习笔记</p>
      <h1>React 观察记录</h1>
      <section className="lesson-card">
        <h2>这一阶段记住三件事</h2>
        <ol className="notes-list">
          <li>组件根据 props 和 state 描述界面。</li>
          <li>事件提交状态变化，Effect 与外部系统同步。</li>
          <li>页面依赖服务接口，不直接关心数据存在哪里。</li>
        </ol>
      </section>
    </main>
  );
}
