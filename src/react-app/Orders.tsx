import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import type { Order, OrderItem } from '../shared/types';
import type { customerFixture } from '../shared/customers';
import { PRODUCTS } from '../shared/products';

type Detail = { item: Order; items: OrderItem[]; customer: ReturnType<typeof customerFixture>; viewerIsOwner: boolean };
export function Orders({ session, loading }: { session: Session | null; loading: boolean }) {
  const { id } = useParams();
  const { pathname } = useLocation();
  const lab = pathname.startsWith('/lab/');
  const [result, setResult] = useState<{ items?: Order[]; detail?: Detail; status?: number }>({});
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    fetch(`/api/${lab ? 'lab/' : ''}orders${id ? `/${encodeURIComponent(id)}` : ''}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) { setResult({ status: response.status }); return; }
      const data = await response.json() as Detail & { items: Order[] };
      if (!controller.signal.aborted) setResult(id ? { detail: data } : { items: data.items });
    }).catch(() => { if (!controller.signal.aborted) setResult({ status: 503 }); });
    return () => controller.abort();
  }, [session, id, lab]);
  if (loading) return <main className="section-wrap short-page">認証を確認しています…</main>;
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(pathname)}`} replace />;
  const detail = result.detail;
  function download() {
    if (!detail) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'SYNTHETIC-customer-evidence.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="section-wrap account-page order-page">
    <p className="eyebrow">YOUR ORDERS</p>
    <h1>{id ? '注文とお客様情報' : '注文履歴'}</h1>
    <nav className="demo-links" aria-label="注文メニュー"><Link to="/account">マイページ</Link><Link to="/orders">注文履歴</Link></nav>
    {result.status && <div className="notice-box" role="alert"><h2>{result.status === 404 ? '注文が見つかりませんでした' : '注文を読み込めませんでした'}</h2><p>{result.status === 404 ? 'URLをご確認のうえ、注文履歴からもう一度お試しください。' : result.status === 401 ? '再ログインしてください。' : 'しばらくしてから、もう一度お試しください。'}</p><button className="button button-outline" onClick={() => window.location.reload()}>再読み込み</button></div>}
    {!result.status && !detail && !result.items && <p role="status">注文を読み込んでいます…</p>}
    {result.items && (result.items.length ? result.items.map((order) => <Link className="demo-order-row" key={order.id} to={`/orders/${order.id}`}><strong>{order.order_code}</strong><span>{order.created_at.slice(0, 10)}</span><span>¥{order.total_jpy.toLocaleString('ja-JP')} →</span></Link>) : <p>注文はありません。</p>)}
    {detail && <>
      <div className="notice-box"><strong>ご注文番号</strong><p>{detail.item.order_code}</p></div>
      <div className="customer-grid"><section className="customer-card"><h2>お客様情報</h2><dl>{Object.entries({ '氏名': detail.customer.full_name, '生年月日': detail.customer.birth_date, '郵便番号': detail.customer.postal_code, '住所': detail.customer.address, '電話番号': detail.customer.phone, 'メール': detail.customer.email, '勤務先': detail.customer.employer, '免許証番号（無効）': detail.customer.license_number }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="customer-card"><h2>免許証サンプル</h2><img className="license-image" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(detail.customer.license_svg)}`} alt="SAMPLE 架空・無効と記載されたデモ免許証。本人確認には使用できません。" /><p>ご登録の確認書類です。</p></section></div>
      <section className="customer-card"><h2>購入履歴</h2>{detail.items.map((item) => <p key={item.id}>{PRODUCTS.find((p) => p.id === item.product_id)?.name ?? '商品'} × {item.quantity} ¥{item.unit_price_jpy.toLocaleString('ja-JP')}</p>)}<strong>合計 ¥{detail.item.total_jpy.toLocaleString('ja-JP')}</strong></section>
      <button className="button button-dark" onClick={download}>注文情報をダウンロード</button>
    </>}
  </main>;
}
