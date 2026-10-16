import { type FormEvent, useMemo, useState } from "react";
import { createMaterial, filterMaterials, restoreMaterial, trashMaterial, type LearningMaterial, type MaterialKind } from "../domain/materials";

export function MaterialsPage() {
  const [items, setItems] = useState<LearningMaterial[]>([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("英语");
  const [kind, setKind] = useState<MaterialKind>("试卷");
  const [query, setQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [mode, setMode] = useState<"active" | "trash">("active");
  const visible = useMemo(() => filterMaterials(items, { query, subject: "全部", favoriteOnly, mode }), [items, query, favoriteOnly, mode]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setItems((current) => [createMaterial({ title, subject, kind, mastery: 1, favorite: false }), ...current]);
    setTitle("");
  }

  return <section className="materials-page">
    <header className="page-heading"><div><p className="eyebrow">个人资料库</p><h1>学习资料</h1><p>保存、分类和重新找到真正需要的内容。</p></div></header>
    <div className="materials-layout">
      <form className="panel material-editor" onSubmit={submit}>
        <p className="panel-kicker">新建资料</p><h2>收进资料库</h2>
        <label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label>学科<select value={subject} onChange={(event) => setSubject(event.target.value)}><option>英语</option><option>数学</option><option>政治</option><option>专业课</option></select></label>
        <label>类型<select value={kind} onChange={(event) => setKind(event.target.value as MaterialKind)}><option>试卷</option><option>作文</option><option>单词</option><option>错题</option><option>笔记</option></select></label>
        <button type="submit">保存资料</button>
      </form>
      <article className="panel material-library">
        <div className="library-toolbar"><input aria-label="搜索资料" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、学科或类型" /><label><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} />只看收藏</label></div>
        <div className="segmented"><button className={mode === "active" ? "selected" : ""} onClick={() => setMode("active")}>资料库</button><button className={mode === "trash" ? "selected" : ""} onClick={() => setMode("trash")}>回收站</button></div>
        {visible.length === 0 ? <p className="empty-state">这里还没有符合条件的资料。</p> : <ul className="material-list">{visible.map((item) => <li key={item.id}><div><span>{item.subject} · {item.kind}</span><strong>{item.title}</strong><small>掌握度 {item.mastery}/5 · 版本 {item.version}</small></div>{mode === "active" ? <button onClick={() => setItems((all) => trashMaterial(all, item.id))}>移到回收站</button> : <button onClick={() => setItems((all) => restoreMaterial(all, item.id))}>恢复</button>}</li>)}</ul>}
      </article>
    </div>
  </section>;
}
