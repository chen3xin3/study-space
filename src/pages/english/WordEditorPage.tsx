import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { createVocabularyService } from "../../services/vocabulary/vocabulary.service";
import type { VocabularyService, WordDetail } from "../../services/vocabulary/vocabulary.types";

interface Props { service?: VocabularyService }

export function WordEditorPage({ service: suppliedService }: Props) {
  const [service] = useState(() => suppliedService ?? createVocabularyService());
  const { wordId = "" } = useParams();
  const [word, setWord] = useState<WordDetail | null>(null);
  const [form, setForm] = useState({ word: "", meanings: "", phonetic: "", partOfSpeech: "", exampleSentence: "", note: "", tags: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setError("");
    try {
      const loaded = await service.getWord(wordId);
      setWord(loaded);
      setForm({
        word: loaded.displayText,
        meanings: loaded.meanings.map((meaning) => meaning.meaning).join("\n"),
        phonetic: loaded.phonetic ?? "",
        partOfSpeech: loaded.partOfSpeech ?? "",
        exampleSentence: loaded.exampleSentence ?? "",
        note: loaded.note ?? "",
        tags: loaded.tags.map((tag) => tag.name).join("，"),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取单词失败。");
    }
  };

  useEffect(() => { void load(); }, [wordId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!word) return;
    setError("");
    try {
      const saved = await service.updateWord({
        id: word.id,
        version: word.version,
        word: form.word,
        meanings: form.meanings.split("\n").map((value) => value.trim()).filter(Boolean),
        phonetic: form.phonetic.trim() || null,
        partOfSpeech: form.partOfSpeech.trim() || null,
        exampleSentence: form.exampleSentence.trim() || null,
        note: form.note.trim() || null,
        tags: form.tags.split(/[,，\n]/).map((value) => value.trim()).filter(Boolean),
      });
      setWord(saved);
      setMessage("修改已保存。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败。");
    }
  };

  return (
    <main className="page vocabulary-page">
      <PageHeader eyebrow="英语 · 单词本" title="编辑单词" description="修改释义、例句、备注和标签；保存时会保护较新的修改。" />
      {!word && !error ? <p>正在读取…</p> : null}
      {error ? <div className="data-error" role="alert">{error}<button type="button" onClick={() => void load()}>重新读取</button></div> : null}
      {word ? (
        <Card className="word-editor-card">
          <form onSubmit={submit}>
            <div className="word-entry-options">
              <label className="field"><span>英文单词</span><input value={form.word} onChange={(event) => setForm({ ...form, word: event.target.value })} /></label>
              <label className="field"><span>词性</span><input value={form.partOfSpeech} onChange={(event) => setForm({ ...form, partOfSpeech: event.target.value })} /></label>
              <label className="field word-entry-options__wide"><span>中文意思（每行一个）</span><textarea value={form.meanings} onChange={(event) => setForm({ ...form, meanings: event.target.value })} /></label>
              <label className="field"><span>音标</span><input value={form.phonetic} onChange={(event) => setForm({ ...form, phonetic: event.target.value })} /></label>
              <label className="field"><span>标签</span><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></label>
              <label className="field word-entry-options__wide"><span>例句</span><textarea value={form.exampleSentence} onChange={(event) => setForm({ ...form, exampleSentence: event.target.value })} /></label>
              <label className="field word-entry-options__wide"><span>备注</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            </div>
            {message ? <p className="form-message form-message--success">{message}</p> : null}
            <div className="word-entry-actions"><button className="primary-button" type="submit">保存修改</button><Link className="secondary-button" to="/english/words">返回单词本</Link></div>
          </form>
        </Card>
      ) : null}
    </main>
  );
}
