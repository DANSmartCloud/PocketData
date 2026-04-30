import { useState } from "react";
import { ArrowLeft, Heart, Code2, FileSpreadsheet, Database, Sparkles, Zap, Shield } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { GeometricBackground } from "@/components/effects/GeometricBackground";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "@/stores/uiStore";
import styles from "./AboutPage.module.css";

// GitHub 图标组件
function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

export function AboutPage() {
  const navigate = useNavigate();
  const { theme } = useUIStore();
  const [isExiting, setIsExiting] = useState(false);
  const version = "1.0.0";
  const buildDate = "2025-01-20";

  const handleBack = () => {
    setIsExiting(true);
    setTimeout(() => {
      navigate(-1);
    }, 200);
  };

  return (
    <div className={`${styles.page} ${theme === 'dark' ? styles.dark : ''} ${isExiting ? styles.exiting : ''}`}>
      {/* 几何动态背景 */}
      <GeometricBackground count={20} lowEnd={false} />

      {/* 悬浮返回按钮 */}
      <button className={styles.backBtn} onClick={handleBack}>
        <ArrowLeft size={20} />
      </button>

      {/* 主内容 */}
      <main className={styles.content}>
        {/* Hero 区域 */}
        <section className={styles.hero}>
          <div className={styles.heroCard}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoGlow} />
              <Logo size={100} className={styles.heroLogo} />
            </div>
            <h1 className={styles.title}>PocketStata</h1>
            <p className={styles.tagline}>轻量级 Stata 数据文件查看器</p>
            <div className={styles.versionBadge}>
              <span className={styles.versionText}>v{version}</span>
              <span className={styles.divider} />
              <span className={styles.buildDate}>{buildDate}</span>
            </div>
          </div>
        </section>

        {/* 功能特性 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Sparkles size={20} />
            核心功能
          </h2>
          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Database size={28} />
              </div>
              <h3>Stata 支持</h3>
              <p>原生支持 DTA 文件格式，保留所有变量标签与值标签</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <FileSpreadsheet size={28} />
              </div>
              <h3>多格式兼容</h3>
              <p>CSV、Excel 文件一键导入导出，数据转换无忧</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Code2 size={28} />
              </div>
              <h3>代码编辑</h3>
              <p>内置代码编辑器，支持语法高亮与智能提示</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Zap size={28} />
              </div>
              <h3>高性能</h3>
              <p>基于 Tauri 构建，Rust 后端提供极速体验</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Shield size={28} />
              </div>
              <h3>本地优先</h3>
              <p>数据完全本地处理，保障隐私安全</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <Sparkles size={28} />
              </div>
              <h3>精美界面</h3>
              <p>现代化 UI 设计，支持深浅色主题切换</p>
            </div>
          </div>
        </section>

        {/* 开发者信息 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Heart size={20} />
            开发者
          </h2>
          <div className={styles.devCard}>
            <div className={styles.devAvatar}>
              <img src="/DirRain.jpg" alt="云云" className={styles.devAvatarImg} />
            </div>
            <div className={styles.devInfo}>
              <h3 className={styles.devName}>云云</h3>
              <div className={styles.orgChain}>
                <span className={styles.orgItem}>禾云工作室</span>
                <span className={styles.orgArrow}>→</span>
                <span className={styles.orgItem}>云研小镇</span>
              </div>
            </div>
          </div>
        </section>

        {/* 技术栈 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>技术栈</h2>
          <div className={styles.techGrid}>
            <div className={styles.techCard}>
              <span className={styles.techName}>Tauri</span>
              <span className={styles.techDesc}>跨平台桌面框架</span>
            </div>
            <div className={styles.techCard}>
              <span className={styles.techName}>React</span>
              <span className={styles.techDesc}>用户界面库</span>
            </div>
            <div className={styles.techCard}>
              <span className={styles.techName}>TypeScript</span>
              <span className={styles.techDesc}>类型安全</span>
            </div>
            <div className={styles.techCard}>
              <span className={styles.techName}>Rust</span>
              <span className={styles.techDesc}>高性能后端</span>
            </div>
          </div>
        </section>

        {/* 底部 */}
        <footer className={styles.footer}>
          <a
            href="https://github.com/yourusername/pocketstata"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.githubLink}
          >
            <GithubIcon size={20} />
            <span>在 GitHub 上查看</span>
          </a>
          <p className={styles.copyright}>
            Made with <Heart size={14} className={styles.heart} /> by 云云 @ 云研小镇
          </p>
        </footer>
      </main>
    </div>
  );
}
