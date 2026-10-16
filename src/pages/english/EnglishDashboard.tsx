import { ArrowUpRight, BookOpen, Camera, FileText, Images, LibraryBig, ScanText } from "lucide-react";
import { Link } from "react-router";
import type { VocabularyService } from "../../services/vocabulary/vocabulary.types";
import "./english-color-archive.css";

export function EnglishDashboard(_props: { service?: VocabularyService } = {}) {
  return (
    <main className="english-resource-space" data-art-direction="color-archive" data-testid="english-resource-space">
      <header className="english-page-header">
        <div>
          <p className="english-page-kicker">资料室</p>
          <h1>英语</h1>
          <p>归档作文、单词照片和试卷，需要时快速找到原始内容。</p>
        </div>
        <span className="english-page-mark" aria-hidden="true">E</span>
      </header>

      <div className="english-resource-main">
        <section className="english-resource-imports" aria-label="拍照导入">
          <div className="english-section-heading">
            <strong>从纸面开始整理</strong>
            <span>保留原图，也保留每次修改的痕迹</span>
          </div>

          <Link className="english-intake-card english-intake-card--words" to="/english/words/import">
            <span className="english-card-icon"><Camera aria-hidden="true" /></span>
            <span className="english-card-copy">
              <small>单词照片与批注</small>
              <strong>拍照导入单词</strong>
              <span>保留原始照片，同时整理其中的单词和注释</span>
            </span>
            <span className="english-card-arrow"><ArrowUpRight aria-hidden="true" /></span>
          </Link>

          <Link className="english-intake-card english-intake-card--essay" to="/english/essays/import">
            <span className="english-card-icon"><ScanText aria-hidden="true" /></span>
            <span className="english-card-copy">
              <small>作文与手稿</small>
              <strong>拍照导入作文</strong>
              <span>保留作文原稿，整理正文与相关信息</span>
            </span>
            <span className="english-card-arrow"><ArrowUpRight aria-hidden="true" /></span>
          </Link>
        </section>

        <section className="english-resource-shelf">
          <div className="english-library-heading">
            <span className="english-library-heading-icon"><LibraryBig aria-hidden="true" /></span>
            <div>
              <small>分类归档</small>
              <h2>英语资料库</h2>
            </div>
          </div>

          <nav className="english-library-drawer" aria-label="英语资料库">
            <Link className="english-library-link english-library-link--words" to="/english/words">
              <span><BookOpen aria-hidden="true" /></span>
              <div>
                <strong>单词资料库</strong>
                <small>单词、注释与例句</small>
              </div>
              <ArrowUpRight aria-hidden="true" />
            </Link>
            <Link className="english-library-link english-library-link--essays" to="/english/essays">
              <span><FileText aria-hidden="true" /></span>
              <div>
                <strong>作文资料库</strong>
                <small>原稿、表达与修改记录</small>
              </div>
              <ArrowUpRight aria-hidden="true" />
            </Link>
            <Link className="english-library-link english-library-link--exams" to="/study/english/exams">
              <span><FileText aria-hidden="true" /></span>
              <div>
                <strong>试卷资料库</strong>
                <small>套卷信息、成绩与整理备注</small>
              </div>
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </nav>

          <Link className="english-photo-card" to="/library/photos?kind=english">
            <Images aria-hidden="true" />
            <div>
              <strong>按日期看原始照片</strong>
              <small>快速找回尚未整理的纸面内容</small>
            </div>
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  )
}

export default EnglishDashboard
