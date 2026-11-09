import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { Text } from './AppTypography';
import { supabase } from '../lib/supabase';
import { peso } from '../lib/format';
import { TAX_RATE, roundMoney, quarterDue, taxStatus, philippineToday } from '../lib/viaeTax';

type Summary = { quarter: number; gross_php: number };
type Payment = { quarter: number; paid_php: number; paid_date: string | null };
const VIAE = '3fe4c82d-a659-406b-b290-32d8a49f2bdf';
const card = { backgroundColor: '#EDF6F3', borderWidth: 1, borderColor: '#C9DDD6', borderRadius: 14, padding: 18, gap: 10, marginVertical: 8 } as const;
const heading = { fontSize: 20, fontWeight: '700', color: '#1B685C' } as const;

export function ViaeTaxScreen({ businessId, onBack, compact = false, onOpen }: { businessId: string; onBack?: () => void; compact?: boolean; onOpen?: () => void }) {
 const [year, setYear] = useState(Number(philippineToday().slice(0, 4)));
 const [rows, setRows] = useState<Summary[]>([]), [payments, setPayments] = useState<Payment[]>([]);
 const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const load = useCallback(async () => {
  setLoading(true); setError('');
  const [a, b] = await Promise.all([
   supabase.rpc('viae_tax_summary', { b: businessId, y: year }),
   supabase.from('viae_tax_filings').select('quarter,paid_php,paid_date').eq('business_id', businessId).eq('tax_year', year),
  ]);
  if (a.error || b.error) setError((a.error || b.error)!.message);
  else { setRows(a.data ?? []); setPayments(b.data ?? []); }
  setLoading(false);
 }, [businessId, year]);
 useEffect(() => { if (businessId === VIAE) void load(); }, [businessId, load]);
 if (businessId !== VIAE) return null;
 const cards = rows.map(row => {
  const payment = payments.find(p => p.quarter === row.quarter);
  const gross = roundMoney(Number(row.gross_php)), tax = roundMoney(gross * TAX_RATE), due = quarterDue(year, row.quarter);
  const paid = !!payment?.paid_date && Number(payment.paid_php) >= tax;
  return { quarter: row.quarter, gross, tax, due, paid, paidDate: payment?.paid_date, status: paid ? 'Paid' : taxStatus(due, false, 0, tax) };
 });
 async function markPaid(quarter: number, tax: number, undo: boolean) {
  if (busy) return;
  setBusy(true); setError('');
  const result = await supabase.from('viae_tax_filings').upsert({
   business_id: businessId, tax_year: year, quarter,
   paid_php: undo ? 0 : tax, paid_date: undo ? null : philippineToday(),
  }, { onConflict: 'business_id,tax_year,quarter' });
  if (result.error) setError(result.error.message); else await load();
  setBusy(false);
 }
 if (compact) {
  const due = cards.filter(c => !c.paid && (c.status.startsWith('Overdue') || c.status.startsWith('Due in')));
  return <Pressable accessibilityRole="button" onPress={onOpen} style={card}>
   <Text style={heading}>Quarterly tax · 3%</Text>
   <Text>{loading ? 'Checking deadlines…' : error ? 'Tap to reload tax summary' : due.length ? due.map(c => `Q${c.quarter} · ${peso(c.tax)} · Due ${c.due}`).join('\n') : 'Gross sales × 3%. View quarterly payments.'}</Text>
  </Pressable>;
 }
 return <ScrollView contentContainerStyle={{ padding: 18, gap: 14, maxWidth: 1000, width: '100%', alignSelf: 'center', paddingBottom: 80 }}>
  <Button label="Back to VIAE" onPress={() => onBack?.()} />
  <Text style={heading}>Quarterly tax · 3%</Text>
  <Text>Gross sales × 3%. No expenses deducted.</Text>
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
   <Button label="Previous year" disabled={busy} onPress={() => setYear(v => v - 1)} />
   <Text style={heading}>{year}</Text>
   <Button label="Next year" disabled={busy} onPress={() => setYear(v => v + 1)} />
  </View>
  {loading ? <ActivityIndicator /> : null}
  {error ? <><Text style={{ color: '#8A2943' }}>{error}</Text><Button label="Reload" onPress={() => void load()} /></> : null}
  {!loading && !error ? cards.map(c => <View key={c.quarter} style={card}>
   <Text style={heading}>Q{c.quarter} · {['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][c.quarter - 1]}</Text>
   <Text>Gross sales: {peso(c.gross)}</Text>
   <Text style={heading}>3% tax: {peso(c.tax)}</Text>
   <Text>Due: {c.due}</Text>
   <Text>{c.status}{c.paid && c.paidDate ? ` · ${c.paidDate}` : ''}</Text>
   <Button label={busy ? 'Saving…' : c.paid ? 'Undo paid' : 'Mark paid'} disabled={busy} onPress={() => void markPaid(c.quarter, c.tax, c.paid)} />
  </View>) : null}
  <Text>Reminders appear on VIAE Home. Due April 25, July 25, October 25 and January 25 next year. Weekend dates shift to Monday; check holiday extensions.</Text>
  <Text>Uses completed sales and shipped/delivered orders, counted once. Mark paid records your confirmation only; it does not pay or file with BIR.</Text>
  <Button label="2551Q reference" onPress={() => void Linking.openURL('https://taxcalculator.com.ph/bir-forms/2551-q')} />
 </ScrollView>;
}
function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ padding: 12, borderRadius: 8, backgroundColor: '#EDF3FB', alignSelf: 'flex-start', opacity: disabled ? .5 : 1 }}><Text style={{ color: '#315FBE', fontWeight: '600' }}>{label}</Text></Pressable>;
}
