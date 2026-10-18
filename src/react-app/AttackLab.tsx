import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import './attack-lab.css';

const services = [
  { id: 'login', name: '会員ログイン', detail: 'ご登録のメールアドレスとパスワードを入力してください。', action: 'ログインする' },
  { id: 'profile', name: '会員情報', detail: 'ご登録のお客様情報をご確認いただけます。', action: '登録情報を確認する' },
  { id: 'search', name: 'お客様検索', detail: 'メールアドレスからお客様を検索できます。', action: '検索する' },
  { id: 'customer', name: 'お客様詳細', detail: '会員番号から登録情報をご確認いただけます。', action: '詳細を確認する' },
  { id: 'documents', name: '資料ダウンロード', detail: 'ストアからのお知らせや資料をご覧いただけます。', action: '資料を開く' },
  { id: 'contact', name: 'お問い合わせ', detail: '商品やストアについてのメッセージをご確認いただけます。', action: '内容を確認する' },
  { id: 'staff', name: 'スタッフログイン', detail: 'スタッフ用のアカウントでログインしてください。', action: 'ログインする' },
  { id: 'export', name: '顧客データ出力', detail: '登録済みのお客様情報をファイルに出力します。', action: 'データを準備する' },
  { id: 'archive', name: 'データ保管庫', detail: '保存された顧客データをダウンロードできます。', action: '保存データを確認する' },
  { id: 'settings', name: 'ストア情報', detail: 'ストアの運営情報をご確認いただけます。', action: 'ストア情報を確認する' },
] as const;
type Service = typeof services[number]['id'];
type Viewer = { id: number; email: string; role: string };
type ResponseData = Record<string, unknown>;
const labels: Record<string, string> = { id: '会員番号', full_name: '氏名', name: '氏名', email: 'メールアドレス', phone: '電話番号', postal_code: '郵便番号', address: '住所', birth_date: '生年月日', employer: '勤務先' };
function CustomerInfo({ data }: { data: ResponseData }) {
  const fields = Object.entries(data).filter(([key, value]) => labels[key] && ['string', 'number'].includes(typeof value));
  return <dl className="member-details">{fields.map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd>{String(value)}</dd></div>)}</dl>;
}
export function AttackLab() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const staffArea = pathname === '/staff';
  const [available, setAvailable] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [term, setTerm] = useState('');
  const [customer, setCustomer] = useState('');
  const [file, setFile] = useState('summary.json');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState('');
  const [viewer, setViewer] = useState<Viewer | null | undefined>(undefined);
  const requested = params.get('section') ?? (pathname === '/contact' ? 'contact' : pathname === '/staff' ? 'staff' : pathname === '/account' && viewer ? 'profile' : 'login');
  const active: Service = services.some((item) => item.id === requested) ? requested as Service : 'login';
  const selected = services.find((item) => item.id === active)!;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResponseData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/attack-lab/status', { signal: controller.signal }).then((r) => setAvailable(r.ok)).catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    void fetch('/api/attack-lab/me', { signal: controller.signal }).then(async (r) => { const identity = r.ok ? (await r.json() as { viewer: Viewer }).viewer : null; if (!controller.signal.aborted) setViewer(identity); }).catch(() => { if (!controller.signal.aborted) setViewer(null); });
    return () => controller.abort();
  }, []);
  function select(section: Service) {
    setResult(null); setError(''); setPreview(''); setPassword(''); setParams({ section });
  }
  async function send(path: string, body?: unknown) {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(`/api/attack-lab${path}`, {
        method: body ? 'POST' : 'GET', credentials: 'same-origin',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = await response.json() as ResponseData;
      if (!response.ok) {
        setError(response.status === 401 ? (path === '/login' ? 'メールアドレスとパスワードをご確認ください。' : 'ログインしてからご利用ください。') : response.status === 404 ? 'お探しの情報が見つかりませんでした。' : response.status === 403 ? 'この操作をご利用いただけません。' : '処理を完了できませんでした。しばらくしてからお試しください。');
        return;
      }
      if (path === '/login') {
        setViewer((data as { viewer: Viewer }).viewer); setPassword(''); setResult(null); setParams({ section: staffArea ? 'settings' : 'profile' });
      } else if (path === '/logout') {
        setViewer(null); setPassword(''); setPreview(''); setParams({ section: staffArea ? 'staff' : 'login' });
      } else setResult(data);
    } catch { setError('接続できませんでした。通信状況をご確認のうえ、もう一度お試しください。'); }
    finally { setBusy(false); }
  }
  function run(event: FormEvent) {
    event.preventDefault();
    if (active === 'contact') { setPreview(message); return; }
    if (active === 'archive') { void send('/backups/customers.json'); return; }
    if (active === 'settings') { void send('/debug/config'); return; }
    if (active === 'login' || active === 'staff') { void send('/login', { email, password, mode: 'vulnerable' }); return; }
    const query = new URLSearchParams({ mode: 'vulnerable' });
    if (active === 'search') { query.set('q', term); void send(`/search?${query}`); }
    if (active === 'customer') void send(`/customers/${encodeURIComponent(customer)}?${query}`);
    if (active === 'export') { query.set('role', viewer?.role ?? 'customer'); void send(`/admin/export?${query}`); }
    if (active === 'profile') void send(`/profile?${query}`);
    if (active === 'documents') { query.set('file', file); void send(`/download?${query}`); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `democommerce-${active}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const records = result && [result.customers, result.rows].find(Array.isArray) as ResponseData[] | undefined;
  const customerData = result?.customer as ResponseData | undefined;
  const loggingIn = active === 'login' || active === 'staff';
  const menu = services.filter((item) => staffArea ? ['staff', 'search', 'customer', 'export', 'archive', 'settings'].includes(item.id) : ['login', 'profile', 'documents', 'contact'].includes(item.id));
  if (available === null || viewer === undefined) return <main className="section-wrap member-page"><p role="status">読み込んでいます…</p></main>;
  if (!available) return <main className="section-wrap member-page"><h1>ただいまご利用いただけません</h1><p>しばらくしてから、もう一度お試しください。</p><Link to="/">ストアへ戻る</Link></main>;
  return <main className="section-wrap member-page">
    <Link className="text-back" to="/">← ストアに戻る</Link>
    <div className="member-heading"><div><p className="eyebrow">{staffArea ? 'STORE MANAGEMENT' : active === 'contact' ? 'CONTACT US' : 'YOUR EVERYDAY'}</p><h1>{staffArea ? 'ストア管理' : active === 'contact' ? 'お問い合わせ' : 'マイページ'}</h1><p>お気に入りのある、いつもの毎日。</p></div>{viewer && <button className="button button-outline" type="button" onClick={() => void send('/logout', {})} disabled={busy}>ログアウト</button>}</div>
    <div className="member-layout"><nav className="member-menu" aria-label={staffArea ? 'ストア管理メニュー' : '会員メニュー'}>{menu.filter((item) => !viewer || !['login', 'staff'].includes(item.id)).map((item) => <button type="button" key={item.id} aria-current={active === item.id ? 'page' : undefined} onClick={() => select(item.id)} disabled={busy}>{item.name}<span aria-hidden="true">→</span></button>)}<Link to="/#collection">商品をさがす<span aria-hidden="true">→</span></Link></nav>
    <section className="member-panel" aria-labelledby="member-title"><p className="eyebrow">{loggingIn ? 'WELCOME BACK' : 'MEMBER SERVICE'}</p><h2 id="member-title">{selected.name}</h2><p className="member-intro">{selected.detail}</p>
      {viewer && loggingIn ? <div className="member-empty"><p>おかえりなさい。</p><button className="button button-dark" type="button" onClick={() => select(staffArea ? 'settings' : 'profile')}>マイページへ →</button></div> : <form onSubmit={run}>
        {loggingIn && <><label htmlFor="member-email">メールアドレス<input id="member-email" type="text" inputMode="email" autoComplete="username" placeholder="メールアドレスを入力" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={256} required disabled={busy} /></label><label htmlFor="member-password">パスワード<input id="member-password" type="password" autoComplete="current-password" placeholder="パスワードを入力" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={256} required disabled={busy} /></label></>}
        {active === 'search' && <label htmlFor="member-search">メールアドレス<input id="member-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="メールアドレスで検索" maxLength={256} disabled={busy} /></label>}
        {active === 'customer' && <label htmlFor="member-number">会員番号<input id="member-number" value={customer} onChange={(e) => setCustomer(e.target.value)} inputMode="numeric" placeholder="会員番号を入力" maxLength={3} required disabled={busy} /></label>}
        {active === 'documents' && <label htmlFor="member-document">資料名<input id="member-document" value={file} onChange={(e) => setFile(e.target.value)} maxLength={256} required disabled={busy} /></label>}
        {active === 'contact' && <label htmlFor="member-message">お問い合わせ内容<textarea id="member-message" aria-describedby="member-message-help" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="お問い合わせ内容をご入力ください" maxLength={2000} rows={6} required /></label>}
        {active === 'contact' && <p className="member-form-note" id="member-message-help">内容を確認できます。この画面からの送信は受け付けていません。</p>}
        {error && <p className="member-error" role="alert">{error}</p>}
        <button className="button button-dark member-submit" type="submit" disabled={busy}>{busy ? '処理しています…' : selected.action}<span aria-hidden="true">→</span></button>
      </form>}
      {preview && active === 'contact' && <section className="member-result" aria-live="polite"><h3>お問い合わせ内容の確認</h3><p className="member-message">{preview}</p><button className="inline-link" type="button" onClick={() => { setPreview(''); document.getElementById('member-message')?.focus(); }}>内容を修正する</button></section>}
      {result && <section className="member-result" aria-live="polite"><div className="member-result-heading"><h3>{records ? `${records.length}件のお客様情報` : active === 'settings' ? 'ストア基本情報' : active === 'documents' ? '資料の準備ができました' : 'ご登録情報'}</h3>{active !== 'settings' && <button className="inline-link" type="button" onClick={download}>ダウンロード ↓</button>}</div>
        {customerData && <CustomerInfo data={customerData} />}
        {records && (records.length ? <div className="member-records">{records.map((record, index) => <CustomerInfo key={String(record.id ?? index)} data={record} />)}</div> : <p>該当するお客様は見つかりませんでした。</p>)}
        {active === 'settings' && <dl className="member-details"><div><dt>ストア名</dt><dd>DemoCommerce</dd></div><div><dt>コンセプト</dt><dd>日々に、いいもの。</dd></div></dl>}
        {active === 'documents' && !records && <p>資料はダウンロードしてご確認いただけます。</p>}
      </section>}
    </section></div>
    <div className="member-help"><span>日々に、いいもの。</span><Link to="/#collection">暮らしの道具を見てみる →</Link></div>
  </main>;
}
