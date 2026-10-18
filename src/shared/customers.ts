export function customerFixture(buyer: 'A' | 'B', userId: string) {
  const a = buyer === 'A';
  // Intentionally fictional; this is not a reproduction of a government ID.
  const name = a ? '架空 花子' : '見本 太郎';
  const licenseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="440" viewBox="0 0 720 440"><rect width="720" height="440" rx="24" fill="#f1eee5"/><rect x="24" y="24" width="672" height="70" rx="12" fill="#183b35"/><text x="48" y="69" font-family="sans-serif" font-size="26" fill="white">DEMO ID / 架空の免許証サンプル</text><rect x="42" y="120" width="150" height="180" fill="#d5ded5"/><circle cx="117" cy="177" r="35" fill="#81998a"/><path d="M57 280 Q57 215 117 215 Q177 215 177 280" fill="#81998a"/><g font-family="sans-serif" fill="#183b35" font-size="23"><text x="220" y="152">${name}</text><text x="220" y="198">ID: DEMO-INVALID-${buyer}</text><text x="220" y="244">発行者: 架空デモストア</text><text x="220" y="286">本人確認には使用できません</text></g><text x="40" y="375" font-family="sans-serif" font-size="45" font-weight="bold" fill="#b64232">SAMPLE / 架空・無効</text><text x="40" y="414" font-family="sans-serif" font-size="18">SYNTHETIC DATA ONLY — NOT A GOVERNMENT DOCUMENT</text></svg>`;
  return {
    user_id: userId, full_name: name, birth_date: a ? '1995-04-12' : '1992-09-23',
    postal_code: '000-0000', address: `架空県サンプル市デモ町${a ? '1-2-3' : '4-5-6'} 見本ハイツ${a ? '101' : '202'}`,
    phone: a ? '000-0000-0001' : '000-0000-0002', email: `buyer-${buyer.toLowerCase()}@example.test`,
    license_number: `DEMO-INVALID-${buyer}`, license_svg: licenseSvg,
    employer: '架空サンプル株式会社', synthetic: true,
  };
}
