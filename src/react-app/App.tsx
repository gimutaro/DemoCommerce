import { Orders } from './Orders'
import { AttackLab } from './AttackLab'
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Product } from '../shared/types'

type IconName = 'arrow' | 'search' | 'user' | 'close' | 'menu' | 'chevron' | 'check' | 'sun' | 'leaf' | 'box' | 'minus' | 'plus'
function Icon({ name, size = 20, ...props }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <><path d="M4 12h15M13 6l6 6-6 6" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    leaf: <><path d="M20 3C7 2 2 8 5 15c5 8 15 3 15-12Z" /><path d="M3 22 15 10M8 17v-6m0 6h6" /></>,
    box: <><path d="m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7.5 4.5l9 5" /></>,
    minus: <path d="M5 12h14" />,
    plus: <path d="M5 12h14M12 5v14" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}
function Brand({ light = false }: { light?: boolean }) {
  return <Link to="/" className={`brand${light ? ' brand-light' : ''}`} aria-label="DemoCommerce ホーム"><span className="brand-symbol" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M24 5v38M5 24h38M10.5 10.5l27 27M10.5 37.5l27-27" /><circle cx="24" cy="24" r="4" fill="var(--paper)" strokeWidth="2.5" /></svg></span><span>DemoCommerce<span className="brand-caption">日々に、いいもの。</span></span></Link>
}

type AppConfig = { mode: 'mock' | 'supabase' | 'unconfigured'; supabaseUrl?: string; supabasePublishableKey?: string; attackLabEnabled?: boolean }
type AuthState = { client: SupabaseClient | null; session: Session | null; config: AppConfig | null; loading: boolean; error: boolean }
const AuthContext = createContext<AuthState>({ client: null, session: null, config: null, loading: true, error: false })
function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ client: null, session: null, config: null, loading: true, error: false })
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    async function initialize() {
      try {
        const response = await fetch('/api/config')
        if (!response.ok) throw new Error('config')
        const config = await response.json() as AppConfig
        if (cancelled) return
        if (config.mode !== 'supabase' || !config.supabaseUrl || !config.supabasePublishableKey) {
          setAuth({ client: null, session: null, config, loading: false, error: false })
          return
        }
        const { createClient } = await import('@supabase/supabase-js')
        if (cancelled) return
        const client = createClient(config.supabaseUrl, config.supabasePublishableKey)
        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
          if (!cancelled) setAuth({ client, session, config, loading: false, error: false })
        })
        unsubscribe = () => subscription.unsubscribe()
        const { data, error } = await client.auth.getSession()
        if (error) throw error
        if (!cancelled) setAuth({ client, session: data.session, config, loading: false, error: false })
      } catch {
        if (!cancelled) setAuth({ client: null, session: null, config: null, loading: false, error: true })
      }
    }
    void initialize()
    return () => { cancelled = true; unsubscribe?.() }
  }, [])
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

function Header() {
  const { session, config } = useContext(AuthContext)
  const [open, setOpen] = useState(false)
  const location = useLocation()
  function searchCatalog() {
    if (location.pathname === '/') {
      document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })
      document.getElementById('product-search')?.focus({ preventScroll: true })
    }
  }
  return <>
    <div className="announcement"><span>いつもの毎日に、ちょうどいいものを。</span><span className="demo-tag">日々に、いいもの。</span></div>
    <header className="site-header">
      <div className="header-inner"><Brand /><nav className="desktop-nav" aria-label="メインナビゲーション"><Link to="/#collection">商品をさがす</Link><Link to="/#about">私たちについて</Link></nav><div className="header-actions"><Link to="/#collection" className="icon-button" aria-label="商品を検索" onClick={searchCatalog}><Icon name="search" /></Link><Link to={config?.attackLabEnabled || session ? '/account' : '/login'} className="account-link" aria-label={config?.attackLabEnabled || session ? 'マイページ' : 'ログイン'}><Icon name="user" /><span>{config?.attackLabEnabled || session ? 'マイページ' : 'ログイン'}</span></Link><button className="icon-button menu-button" type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}><Icon name={open ? 'close' : 'menu'} /></button></div></div>
      {open && <nav className="mobile-nav" id="mobile-menu" aria-label="モバイルナビゲーション"><Link to="/#collection" onClick={() => setOpen(false)}>商品をさがす<Icon name="arrow" /></Link><Link to="/#about" onClick={() => setOpen(false)}>私たちについて<Icon name="arrow" /></Link><Link to={config?.attackLabEnabled || session ? '/account' : '/login'} onClick={() => setOpen(false)}>{config?.attackLabEnabled || session ? 'マイページ' : 'ログイン'}<Icon name="arrow" /></Link></nav>}
    </header>
  </>
}

function Footer() {
  return <footer className="site-footer"><div className="footer-main"><Brand /><p>選ぶ時間も、使う時間も。<br />日々の小さな楽しみを、ここから。</p><div className="footer-links"><Link to="/#collection">商品一覧<Icon name="arrow" size={15} /></Link><Link to="/#about">私たちについて<Icon name="arrow" size={15} /></Link><Link to="/login">会員ログイン<Icon name="arrow" size={15} /></Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} DemoCommerce</span><p>毎日の暮らしに寄り添う道具を、一つひとつ。</p><a href="#top" className="back-top">PAGE TOP <span>↑</span></a></div></footer>
}

function PageScroll() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const timer = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 80)
      return () => window.clearTimeout(timer)
    }
    window.scrollTo({ top: 0 })
  }, [pathname, hash])
  return null
}

const yen = (amount: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount)
function ProductCard({ product, index }: { product: Product; index: number }) {
  return <article className="product-card"><Link to={`/products/${product.slug}`} className="product-card-link"><div className={`product-art product-art-${product.slug}`}><span className="product-category">{product.category}</span>{index === 0 && <span className="product-badge">PICK UP</span>}<img src={product.image_path} alt={product.name} loading="lazy" width="500" height="540" /><span className="product-open"><Icon name="arrow" size={19} /></span></div><div className="product-card-info"><h3>{product.name}</h3><p>{yen(product.price_jpy)}<span>税込</span></p></div></Link></article>
}
function StateMessage({ title, children, retry }: { title: string; children: ReactNode; retry?: () => void }) {
  return <div className="state-message" role="status"><span className="state-mark">✳</span><h2>{title}</h2><p>{children}</p>{retry && <button className="button button-dark" type="button" onClick={retry}>もう一度読み込む<Icon name="arrow" size={17} /></button>}</div>
}
function ProductSkeleton() {
  return <div className="product-grid" aria-label="商品を読み込み中" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton-art" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}</div>
}

function Home() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [category, setCategory] = useState('すべて')
  const [query, setQuery] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/products', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('products')
        const data = await response.json() as { items: Product[] }
        if (!Array.isArray(data.items)) throw new Error('products')
        return data.items
      })
      .then((items) => { if (!controller.signal.aborted) setProducts(items) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])
  const filtered = products.filter((p) => (category === 'すべて' || p.category === category) && `${p.name} ${p.description} ${p.category}`.toLocaleLowerCase('ja').includes(query.trim().toLocaleLowerCase('ja')))
  return <main>
    <section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><p className="eyebrow"><span /> THE EVERYDAY COLLECTION</p><h1 id="hero-title">いつもの暮らしに、<br />小さな、<span className="hero-word">いいもの。</span></h1><p className="hero-description">お気に入りのノート。手になじむマグ。<br />なんでもない毎日が、少しだけ楽しみになる。<br />そんな道具たちを、集めました。</p><a className="button button-dark hero-button" href="#collection">お気に入りを見つける<Icon name="arrow" size={19} /></a><div className="hero-footnote"><span>LESS, BUT LOVELY.</span><span>01 — 10 ITEMS</span></div></div><div className="hero-visual"><img src="/hero-still-life.svg" alt="暖かな光の中に並ぶ、真鍮のペン、深緑のノート、白いマグカップとテラコッタ色のデスクライト" width="900" height="800" fetchPriority="high" /><div className="hero-image-caption"><span>GOOD THINGS,<br />FOR ORDINARY DAYS.</span><span className="hero-seal">日々に<br /><strong>いいもの</strong><span>DEMO COMMERCE</span></span></div></div></section>
    <section className="values-bar" aria-label="ストアのこだわり"><div><Icon name="leaf" size={25} /><span>つかうほど、好きになる<small>MADE FOR EVERYDAY</small></span></div><div><Icon name="sun" size={27} /><span>暮らしになじむデザイン<small>SIMPLE & THOUGHTFUL</small></span></div><div><Icon name="box" size={25} /><span>小さな「いいね」を集めて<small>A LITTLE JOY, EVERY DAY</small></span></div></section>
    <section className="collection section-wrap" id="collection" aria-labelledby="collection-title"><div className="section-heading"><div><p className="eyebrow">OUR COLLECTION</p><h2 id="collection-title">日々を、ととのえる。</h2></div><p>いつもの場所に、いつものお気に入り。<br />あなたの毎日に寄り添う、10の道具。</p></div><div className="collection-toolbar"><div className="category-tabs" role="group" aria-label="商品のカテゴリ">{['すべて', '文房具', '暮らし', 'ガジェット'].map((cat) => <button key={cat} type="button" aria-pressed={category === cat} className={category === cat ? 'category-tab active' : 'category-tab'} onClick={() => setCategory(cat)}>{cat}{cat === 'すべて' && <span>{products.length || '10'}</span>}</button>)}</div><div className="search-field"><Icon name="search" size={18} /><input id="product-search" type="search" aria-label="商品を検索" placeholder="商品をさがす" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" className="clear-search" aria-label="検索をクリア" onClick={() => setQuery('')}><Icon name="close" size={15} /></button>}</div></div><div className="collection-result" aria-live="polite">{!loading && !error && <><span>{filtered.length} ITEMS</span>{(query || category !== 'すべて') && <button type="button" onClick={() => { setQuery(''); setCategory('すべて') }}>絞り込みをクリア<Icon name="close" size={12} /></button>}</>}</div>{loading ? <ProductSkeleton /> : error ? <StateMessage title="商品を読み込めませんでした" retry={() => { setLoading(true); setError(false); setAttempt(attempt + 1) }}>通信状況をご確認のうえ、もう一度お試しください。</StateMessage> : filtered.length === 0 ? <StateMessage title="お探しの商品が見つかりませんでした">キーワードやカテゴリを変えて、もう一度さがしてみてください。</StateMessage> : <div className="product-grid">{filtered.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>}<div className="collection-end"><span /><p>暮らしに、ちいさな余白を。</p><span /></div></section>
    <section className="about-section" id="about" aria-labelledby="about-title"><div className="about-art"><img src="/quiet-moments.svg" alt="机の上のノートとコーヒー。日々の静かなひととき。" loading="lazy" width="800" height="600" /><span className="about-art-label">THE ART OF EVERYDAY.</span></div><div className="about-copy"><p className="eyebrow">A NOTE FROM US</p><h2 id="about-title">なんでもない日を、<br />ちょっと好きになる。</h2><p>暮らしを変えるのは、<br />案外、小さなものなのかもしれません。</p><p>書き心地のいいペン。<br />朝のコーヒーが楽しみになるカップ。<br />私たちは、そんな「ちょうどいい」を大切にしています。</p><div className="about-signature">日々に、いいもの。<span>DemoCommerce</span></div></div></section>
    <section className="demo-note section-wrap"><span className="demo-note-icon">i</span><div><h2>お気に入りを、ゆっくりと。</h2><p>素材やかたち、使い心地。あなたの毎日にちょうどいい道具を見つけてください。</p></div><Link className="demo-note-label" to="/contact">CONTACT US →</Link></section>
  </main>
}

function Breadcrumb({ current }: { current: string }) {
  return <nav className="breadcrumb" aria-label="パンくずリスト"><Link to="/">ホーム</Link><Icon name="chevron" size={11} /><Link to="/#collection">商品一覧</Link><Icon name="chevron" size={11} /><span aria-current="page">{current}</span></nav>
}
function ProductDetail() {
  const { slug } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(slug ?? '')}`, { signal: controller.signal })
        if (response.status === 404) { setState('missing'); return }
        if (!response.ok) throw new Error('product')
        const data = await response.json() as { item: Product }
        setProduct(data.item)
        setState('ready')
      } catch { if (!controller.signal.aborted) setState('error') }
    }
    void load()
    return () => controller.abort()
  }, [slug, attempt])
  useEffect(() => {
    document.title = product ? `${product.name} — DemoCommerce` : '商品詳細 — DemoCommerce'
    return () => { document.title = 'DemoCommerce — 日々に、いいもの。' }
  }, [product])
  if (state === 'loading') return <main className="section-wrap detail-loading" aria-busy="true"><div className="detail-skeleton skeleton-art" /><div><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line short" /></div></main>
  if (state === 'missing') return <NotFound product />
  if (state === 'error' || !product) return <main className="section-wrap short-page"><StateMessage title="商品を読み込めませんでした" retry={() => { setState('loading'); setAttempt(attempt + 1) }}>通信状況をご確認のうえ、もう一度お試しください。</StateMessage></main>
  return <main className="section-wrap detail-page"><Breadcrumb current={product.name} /><section className="product-detail"><div className={`detail-art product-art-${product.slug}`}><img src={product.image_path} alt={product.name} width="700" height="756" /><span className="detail-art-caption">A GOOD THING FOR YOUR EVERYDAY.</span></div><div className="detail-copy"><p className="eyebrow">{product.category} <span> / EVERYDAY ESSENTIALS</span></p><h1>{product.name}</h1><p className="detail-price">{yen(product.price_jpy)}<span>税込</span></p><p className="detail-description">{product.description}</p><div className="stock-line"><span className={product.stock > 0 ? 'stock-dot' : 'stock-dot unavailable'} />{product.stock > 0 ? `在庫あり（${product.stock}点）` : 'ただいま在庫がありません'}<span>商品番号：{product.slug.toUpperCase()}</span></div><div className="detail-demo-notice"><span className="mini-eyebrow">EVERYDAY ESSENTIALS</span><p>日々の暮らしに、そっとなじむ。<br />お気に入りの道具と、心地よい時間を。</p></div><Link to="/#collection" className="button button-dark detail-back">ほかの商品も見てみる<Icon name="arrow" size={18} /></Link><details className="detail-accordion" open><summary>この商品について<span>＋</span></summary><p>毎日にそっとなじむ、シンプルな暮らしの道具。素材や使い心地を大切に、毎日使いたくなるものを集めました。商品画像はイメージです。</p></details><details className="detail-accordion"><summary>ストアについて<span>＋</span></summary><p>文房具、暮らしの道具、ガジェット。いつもの毎日に小さな楽しみを添えるアイテムをお届けします。</p></details></div></section><div className="detail-bottom"><Icon name="leaf" size={23} /><p>使う時間が、好きになる。<span>LESS, BUT LOVELY.</span></p><Link to="/#collection">商品一覧へ<Icon name="arrow" size={18} /></Link></div></main>
}

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/account'
  try { const target = new URL(value, window.location.origin); return target.origin === window.location.origin && target.pathname !== '/login' ? `${target.pathname}${target.search}${target.hash}` : '/account' } catch { return '/account' }
}
function Login() {
  const { client, session, loading, config, error: configError } = useContext(AuthContext)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const returnTo = safeReturnTo(params.get('returnTo'))
  if (config?.attackLabEnabled && params.get('auth') !== 'supabase') return <AttackLab />
  if (session) return <Navigate to={returnTo} replace />
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) { setError('ログインできませんでした。メールアドレスとパスワードをご確認ください。'); return }
      navigate(returnTo, { replace: true })
    } catch { setError('接続できませんでした。通信状況をご確認のうえ、もう一度お試しください。') } finally { setSubmitting(false) }
  }
  return <main className="login-page section-wrap"><Link className="text-back" to="/"><span>←</span> ストアに戻る</Link><div className="login-layout"><div className="login-art"><img src="/quiet-moments.svg" alt="コーヒーとノートを楽しむ、静かな机の風景" width="800" height="600" /><div><p className="eyebrow">WELCOME TO YOUR EVERYDAY</p><h2>お気に入りのある、<br />いつもの毎日。</h2><span>日々に、いいもの。</span></div></div><section className="login-panel" aria-labelledby="login-title"><p className="eyebrow">GOOD TO SEE YOU</p><h1 id="login-title">おかえりなさい。</h1><p className="login-intro">ご登録のアカウントでログインして、<br />お気に入りのある毎日を。</p>{!loading && !client && <div className="notice-box" role="status"><strong>{configError ? 'ログイン情報を読み込めませんでした' : 'ただいまログインをご利用いただけません'}</strong><p>{configError ? 'ページを再読み込みして、もう一度お試しください。' : '商品は引き続きご覧いただけます。しばらくしてから、もう一度お試しください。'}</p>{configError && <button type="button" className="inline-link" onClick={() => window.location.reload()}>ページを再読み込み</button>}</div>}<form onSubmit={(event) => void login(event)}><label htmlFor="email">メールアドレス<input id="email" type="email" name="email" autoComplete="username" placeholder="メールアドレスを入力" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={!client || loading || submitting} /></label><label htmlFor="password">パスワード<input id="password" type="password" name="password" autoComplete="current-password" placeholder="パスワードを入力" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} disabled={!client || loading || submitting} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark login-submit" type="submit" disabled={!client || loading || submitting}>{loading ? '準備中…' : submitting ? 'ログイン中…' : 'ログインする'}{!loading && !submitting && <Icon name="arrow" size={18} />}</button></form><p className="login-test-note"><Icon name="user" size={17} /><span>ご登録のメールアドレスでログインできます。</span></p><div className="login-bottom"><span>YOUR EVERYDAY</span><Link to="/#collection">商品を見てみる<Icon name="arrow" size={15} /></Link></div></section></div></main>
}

function Account() {
  const { session, client, loading, config } = useContext(AuthContext)
  const [profile, setProfile] = useState<{ id: string; displayName: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    async function loadProfile() {
      try {
        const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${session!.access_token}` }, signal: controller.signal })
        if (!response.ok) throw new Error('profile')
        setProfile(await response.json() as { id: string; displayName: string })
      } catch { if (!controller.signal.aborted) setError('プロフィールを読み込めませんでした。再試行してください。') }
    }
    void loadProfile()
    return () => controller.abort()
  }, [session, attempt])
  if (loading) return <main className="section-wrap short-page"><StateMessage title="準備しています">少しだけお待ちください。</StateMessage></main>
  if (config?.attackLabEnabled) return <AttackLab key="account" />
  if (!session) return <Navigate to="/login?returnTo=%2Faccount" replace />
  async function signOut() {
    if (!client) return
    setBusy(true)
    try {
      const { error: signOutError } = await client.auth.signOut()
      if (signOutError) setError('ログアウトできませんでした。もう一度お試しください。')
    } catch { setError('ログアウトできませんでした。通信状況をご確認ください。') } finally { setBusy(false) }
  }
  return <main className="section-wrap account-page"><p className="eyebrow">YOUR ACCOUNT</p><h1>マイページ</h1><p className="account-welcome">今日も、日々にいいものを。</p><section className="profile-card"><span className="profile-avatar"><Icon name="user" size={31} /></span><div><p className="eyebrow">MEMBER ACCOUNT</p><h2>{profile?.displayName || 'お客様'}</h2><p>ご登録の会員情報をご確認いただけます。</p></div><span className="signed-in"><Icon name="check" size={13} />ログイン中</span></section>{error && <div className="notice-box" role="alert"><p>{error}</p><button className="inline-link" type="button" onClick={() => { setError(''); setAttempt(attempt + 1) }}>プロフィールを再読み込み</button></div>}<div className="account-actions"><Link to="/orders" className="button button-outline">注文履歴・お客様情報</Link><Link to="/#collection" className="button button-dark">商品をさがす<Icon name="arrow" size={18} /></Link><button type="button" className="button button-outline" onClick={() => void signOut()} disabled={busy}>{busy ? 'ログアウト中…' : 'ログアウト'}</button></div><p className="account-note">ご注文や登録情報は、マイページからご確認いただけます。</p></main>
}

function OrderPage() {
  const { session, loading } = useContext(AuthContext)
  const { pathname } = useLocation()
  return <Orders key={pathname + (session?.user.id ?? '')} session={session} loading={loading} />
}

function NotFound({ product = false }: { product?: boolean }) {
  return <main className="not-found section-wrap"><p className="eyebrow">A LITTLE DETOUR</p><span className="not-found-number">404<span>✳</span></span><h1>{product ? 'この商品は見つかりませんでした。' : 'お探しのページが見つかりませんでした。'}</h1><p>{product ? '公開が終了したか、URLが変更された可能性があります。' : '少し寄り道して、あなたのお気に入りを探しませんか。'}</p><Link to="/#collection" className="button button-dark">商品を見てみる<Icon name="arrow" size={18} /></Link></main>
}
export default function App() {
  const { pathname } = useLocation()
  return <AuthProvider><div id="top" /><a className="skip-link" href="#main-content">本文へスキップ</a><PageScroll /><Header key={pathname} /><div id="main-content" tabIndex={-1}><Routes><Route path="/" element={<Home />} /><Route path="/products/:slug" element={<ProductDetail key={pathname} />} /><Route path="/login" element={<Login />} /><Route path="/account" element={<Account />} /><Route path="/orders" element={<OrderPage />} /><Route path="/orders/:id" element={<OrderPage />} /><Route path="/lab/orders/:id" element={<OrderPage />} /><Route path="/lab/workbench" element={<AttackLab key={pathname} />} /><Route path="/contact" element={<AttackLab key={pathname} />} /><Route path="/staff" element={<AttackLab key={pathname} />} /><Route path="*" element={<NotFound />} /></Routes></div><Footer /></AuthProvider>
}
