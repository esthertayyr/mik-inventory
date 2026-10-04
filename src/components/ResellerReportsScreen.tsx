import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { supabase } from "@/src/lib/supabase";
import { Text, TextInput } from "@/src/components/AppTypography";
import { userNotice } from "@/src/lib/userNotice";
import { ExpenseDatePicker } from "./ExpensesScreen";
import type { TradeEntry } from "./ResellerTradeScreen";

type Period = "today" | "week" | "month" | "custom";
type Payment = {
  id: string;
  payment_type: "deposit" | "final" | "delivery";
  amount_php: number;
  payment_method: string;
  payment_date: string;
};
type Order = {
  direct_sale: boolean;
  id: string;
  customer_name: string;
  product_name: string;
  package_name: string | null;
  quantity: number;
  total_price_php: number;
  delivery_fee_php: number;
  fulfilment_status: string;
  created_at: string;
  reseller_preorder_payments: Payment[];
};

const peso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const display = (value: string) => {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
};
const parseDisplayDate = (value: string) => {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const result = `${match[3]}-${match[2]}-${match[1]}`;
  return Number.isNaN(new Date(`${result}T12:00:00`).getTime()) ? null : result;
};
const csv = (value: unknown) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;
const paymentName: Record<string, string> = {
  deposit: "Deposit",
  final: "Final payment",
  delivery: "Delivery fee",
};

export function ResellerReportsScreen({
  businessId,
  onBack,
}: {
  businessId: string;
  onBack: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades,setTrades]=useState<TradeEntry[]>([]);
  const [expenses,setExpenses]=useState<{id:string;expense_date:string;description:string;amount:number;payment_method:string}[]>([]);
  const [loadError,setLoadError]=useState("");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const now = new Date();
  const [startText, setStartText] = useState(
    display(iso(new Date(now.getFullYear(), now.getMonth(), 1))),
  );
  const [endText, setEndText] = useState(display(iso(now)));

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error },tradeResult,expenseResult] = await Promise.all([supabase
      .from("reseller_preorders")
      .select(
        "id,direct_sale,customer_name,product_name,package_name,quantity,total_price_php,delivery_fee_php,fulfilment_status,created_at,reseller_preorder_payments(id,payment_type,amount_php,payment_method,payment_date)",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
      supabase.from('reseller_trade_entries').select('*').eq('business_id',businessId),
      supabase.from('expenses').select('id,expense_date,description,amount,payment_method').eq('business_id',businessId)]);
    const failure=error||tradeResult.error||expenseResult.error;
    setLoadError(failure?.message??"");
    setTrades((tradeResult.data??[]) as TradeEntry[]);setExpenses(expenseResult.data??[]);
    setOrders((data ?? []) as Order[]);
    setLoading(false);
  }, [businessId]);
  useEffect(() => void load(), [load]);

  const range = useMemo(() => {
    const today = iso(new Date());
    if (period === "today") return { start: today, end: today };
    if (period === "week") {const start=new Date();start.setDate(start.getDate()-((start.getDay()+6)%7));const end=new Date(start);end.setDate(end.getDate()+6);return {start:iso(start),end:iso(end)};}
    if (period === "month")
      return {
        start: `${today.slice(0, 7)}-01`,
        end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    return {
      start: parseDisplayDate(startText),
      end: parseDisplayDate(endText),
    };
  }, [period, startText, endText]);
  const validRange = Boolean(range.start && range.end && range.start <= range.end);
  const selectedTrades=trades.filter(row=>row.status!=='cancelled'&&row.payment_date&&validRange&&row.payment_date>=range.start!&&row.payment_date<=range.end!);
  const selectedExpenses=expenses.filter(row=>validRange&&row.expense_date>=range.start!&&row.expense_date<=range.end!);
  const productSaleMoney=selectedTrades.filter(row=>row.kind==='sale').reduce((sum,row)=>sum+Number(row.amount_php),0);
  const purchaseMoney=selectedTrades.filter(row=>row.kind==='purchase').reduce((sum,row)=>sum+Number(row.amount_php),0);
  const expenseMoney=selectedExpenses.reduce((sum,row)=>sum+Number(row.amount),0);
  const payments = useMemo(
    () =>
      validRange
        ? orders.flatMap((order) =>
            (order.reseller_preorder_payments ?? [])
              .filter(
                (payment) =>
                  payment.payment_date >= range.start! &&
                  payment.payment_date <= range.end!,
              )
              .map((payment) => ({ order, payment })),
          )
        : [],
    [orders, range, validRange],
  );
  const packageSaleMoney=payments.filter(row=>row.order.direct_sale).reduce((sum,row)=>sum+Number(row.payment.amount_php),0);
  const saleMoney=productSaleMoney+packageSaleMoney;
  const newOrders = useMemo(
    () =>
      validRange
        ? orders.filter((order) => {
            const date = order.created_at.slice(0, 10);
            return !order.direct_sale && order.fulfilment_status !== 'cancelled' && date >= range.start! && date <= range.end!;
          })
        : [],
    [orders, range, validRange],
  );
  const totals = useMemo(() => {
    const byType = (type: Payment["payment_type"]) =>
      payments
        .filter(({ order, payment }) => !order.direct_sale && payment.payment_type === type)
        .reduce((sum, { payment }) => sum + Number(payment.amount_php), 0);
    const received = payments.filter(row=>!row.order.direct_sale).reduce(
      (sum, { payment }) => sum + Number(payment.amount_php),
      0,
    );
    const outstanding = orders
      .filter(
        (order) =>
          !["delivered", "cancelled"].includes(order.fulfilment_status),
      )
      .reduce((sum, order) => {
        const paid = (order.reseller_preorder_payments ?? []).reduce(
          (amount, payment) => amount + Number(payment.amount_php),
          0,
        );
        return (
          sum +
          Math.max(
            0,
            Number(order.total_price_php) +
              Number(order.delivery_fee_php) -
              paid,
          )
        );
      }, 0);
    return {
      received,
      deposit: byType("deposit"),
      final: byType("final"),
      delivery: byType("delivery"),
      outstanding,
    };
  }, [orders, payments]);
  const packages = useMemo(() => {
    const grouped = new Map<string, { count: number; value: number }>();
    newOrders.forEach((order) => {
      const name = order.package_name || order.product_name;
      const current = grouped.get(name) ?? { count: 0, value: 0 };
      if (!(order.reseller_preorder_payments??[]).length) return;
      current.count += Number(order.quantity);
      current.value += Number(order.total_price_php);
      grouped.set(name, current);
    });
    return [...grouped.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [newOrders]);

  const exportReport = async () => {
    if (loadError) return userNotice('Report unavailable', 'Reload the page before exporting.');
    if (!validRange)
      return userNotice(
        "Check the date range",
        "Use DD-MM-YYYY and make sure the end date is not before the start date.",
      );
    const rows = [
      [
        "Payment date",
        "Customer",
        "Package or product",
        "Payment type",
        "Amount PHP",
        "Paid using",
        "Order total PHP",
        "Current order status",
      ],
      ...payments.map(({ order, payment }) => [
        display(payment.payment_date),
        order.customer_name,
        order.package_name || order.product_name,
        order.direct_sale?'Package sale':paymentName[payment.payment_type],
        payment.amount_php,
        payment.payment_method.toUpperCase(),
        order.total_price_php,
        order.fulfilment_status.replaceAll("_", " "),
      ]),
    ];
    rows.push(...selectedTrades.map(row=>[display(row.payment_date!),row.kind==='sale'?'Direct sale':'Supplier purchase',`${row.product_name} · ${row.variant_name}`,row.kind==='sale'?'Sale received':'Purchase paid',row.kind==='sale'?Number(row.amount_php):-Number(row.amount_php),row.payment_method.toUpperCase(),Number(row.amount_php),row.status]));
    rows.push(...selectedExpenses.map(row=>[display(row.expense_date),'Business expense',row.description,'Expense paid',-Number(row.amount),row.payment_method.toUpperCase(),Number(row.amount),'recorded']));
    const content = "\uFEFF" + rows.map((row) => row.map(csv).join(",")).join("\n");
    const filename = `mik-reseller-report-${range.start}-to-${range.end}.csv`;
    if (Platform.OS === "web") {
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    const file = new File(Paths.cache, filename);
    file.create();
    file.write(content);
    await Sharing.shareAsync(file.uri);
  };

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Pressable style={s.back} onPress={onBack}>
          <Ionicons name="chevron-back" size={22} color="#151924" />
        </Pressable>
        <View style={s.flex}>
          <Text style={s.title}>VIAE reports</Text>
          <Text style={s.help}>
            Sales, customer payments, purchases and expenses.
          </Text>
        </View>
      </View>
      <View style={s.tabs}>
        <Tab label="Today" active={period === "today"} onPress={() => setPeriod("today")} />
        <Tab label="This week" active={period === "week"} onPress={() => setPeriod("week")} />
        <Tab label="This month" active={period === "month"} onPress={() => setPeriod("month")} />
        <Tab label="Date range" active={period === "custom"} onPress={() => setPeriod("custom")} />
      </View>
      {period === "custom" ? (
        <View style={s.dateRow}>
          <View style={s.dateField}><ExpenseDatePicker label="From" value={startText} onChange={setStartText}/></View>
          <View style={s.dateField}><ExpenseDatePicker label="To" value={endText} onChange={setEndText}/></View>
        </View>
      ) : null}
      {!validRange ? (
        <View style={s.warning}><Text style={s.warningText}>Check the dates. Use DD-MM-YYYY.</Text></View>
      ) : null}
      {loadError?<Text style={s.warningText}>Report incomplete: {loadError}</Text>:null}
      {loading ? (
        <View style={s.loading}><ActivityIndicator color="#594C8D" /><Text style={s.help}>Preparing report…</Text></View>
      ) : loadError ? <Text style={s.help}>Reload this page to try again. No totals are shown until all records load.</Text> : (
        <>
          <View style={s.hero}>
            <Text style={s.eyebrow}>MONEY AFTER SPENDING</Text>
            <Text style={s.heroValue}>{peso(totals.received+saleMoney-purchaseMoney-expenseMoney)}</Text>
            <Text style={s.help}>{validRange?`${display(range.start!)} to ${display(range.end!)}`:'Choose a valid date range'} · Cash flow, not profit</Text>
          </View>
          <View style={s.grid}>
            <Metric label="Direct sales" value={peso(saleMoney)} tone="blue" />
            <Metric label="Order money received" value={peso(totals.received)} tone="purple" />
            <Metric label="Supplier purchases paid" value={peso(purchaseMoney)} tone="neutral" />
            <Metric label="Other expenses" value={peso(expenseMoney)} tone="red" />
            <Metric label="Deposits received" value={peso(totals.deposit)} tone="purple" />
            <Metric label="Final payments" value={peso(totals.final)} tone="blue" />
            <Metric label="Delivery fees" value={peso(totals.delivery)} tone="neutral" />
            <Metric label="New pre-orders" value={`${newOrders.length}`} tone="green" />
            <Metric label="Still to collect" value={peso(totals.outstanding)} tone="red" help="Across all active pre-orders" />
          </View>
          <View style={s.section}><Text style={s.sectionTitle}>Sales and spending</Text><Text style={s.help}>Preorder payments are listed below, not counted again as direct sales. Do not add supplier purchases to Expenses.</Text>{selectedTrades.map(row=><View key={row.id} style={s.row}><View style={s.flex}><Text style={s.rowTitle}>{row.product_name} · {row.variant_name}</Text><Text style={s.help}>{row.kind==='sale'?'Sale':'Purchase'} · × {row.quantity} · {display(row.payment_date!)}</Text></View><Text style={s.rowValue}>{row.kind==='purchase'?'−':''}{peso(Number(row.amount_php))}</Text></View>)}{selectedExpenses.map(row=><View key={row.id} style={s.row}><View style={s.flex}><Text style={s.rowTitle}>{row.description}</Text><Text style={s.help}>Expense · {display(row.expense_date)}</Text></View><Text style={s.rowValue}>−{peso(Number(row.amount))}</Text></View>)}</View>
          <View style={s.section}>
            <Text style={s.sectionTitle}>Package performance</Text>
            <Text style={s.help}>Packages ordered during this period.</Text>
            {packages.length ? packages.map(([name, value]) => (
              <View key={name} style={s.row}>
                <View style={s.flex}><Text style={s.rowTitle}>{name}</Text><Text style={s.help}>{value.count} customer order{value.count === 1 ? "" : "s"}</Text></View>
                <Text style={s.rowValue}>{peso(value.value)}</Text>
              </View>
            )) : <Text style={s.empty}>No pre-orders were added in this period.</Text>}
          </View>
          <View style={s.section}>
            <Text style={s.sectionTitle}>Payments received</Text>
            {payments.length ? payments.map(({ order, payment }) => (
              <View key={payment.id} style={s.row}>
                <View style={s.flex}><Text style={s.rowTitle}>{order.customer_name}</Text><Text style={s.help}>{order.package_name || order.product_name} · {paymentName[payment.payment_type]} · {payment.payment_method.toUpperCase()}</Text><Text style={s.date}>{display(payment.payment_date)}</Text></View>
                <Text style={s.rowValue}>{peso(Number(payment.amount_php))}</Text>
              </View>
            )) : <Text style={s.empty}>No customer payments in this period.</Text>}
          </View>
          <Pressable style={s.export} onPress={() => void exportReport()}>
            <Ionicons name="download-outline" size={20} color="white" />
            <Text style={s.exportText}>Export for Excel</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[s.tab, active && s.tabOn]} onPress={onPress}><Text style={[s.tabText, active && s.tabTextOn]}>{label}</Text></Pressable>;
}
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View style={s.dateField}><Text style={s.label}>{label}</Text><TextInput style={s.input} value={value} onChangeText={onChange} placeholder="DD-MM-YYYY" keyboardType="number-pad" /></View>;
}
function Metric({ label, value, tone, help }: { label: string; value: string; tone: "purple" | "blue" | "green" | "red" | "neutral"; help?: string }) {
  const tones = { purple: ["#F3F0F8", "#594C8D"], blue: ["#EDF3FB", "#315FBE"], green: ["#EDF6F3", "#1B685C"], red: ["#FBEEF2", "#8A2943"], neutral: ["#F3F4F6", "#4F5664"] } as const;
  return <View style={[s.metric, { backgroundColor: tones[tone][0] }]}><Text style={[s.metricLabel, { color: tones[tone][1] }]}>{label}</Text><Text style={s.metricValue}>{value}</Text>{help ? <Text style={s.metricHelp}>{help}</Text> : null}</View>;
}

const s = StyleSheet.create({
  page: { padding: 18, paddingBottom: 80, width: "100%", boxSizing: "border-box", maxWidth: 1050, alignSelf: "center", gap: 15 },
  flex: { flex: 1 }, header: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: "#E0E3EA", alignItems: "center", justifyContent: "center", backgroundColor: "white" },
  title: { fontSize: 23, fontWeight: "700", color: "#151924" }, help: { fontSize: 14, lineHeight: 20, color: "#626A78" },
  tabs: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, tab: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: "#D9DDE5", alignItems: "center", justifyContent: "center", backgroundColor: "white", flexGrow: 1 }, tabOn: { backgroundColor: "#594C8D", borderColor: "#594C8D" }, tabText: { fontSize: 14, fontWeight: "700", color: "#4F5664" }, tabTextOn: { color: "white" },
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, dateField: { flex: 1, minWidth: 190, gap: 6 }, label: { fontSize: 13, fontWeight: "600", color: "#343A47" }, input: { minHeight: 46, borderWidth: 1, borderColor: "#D9DDE5", borderRadius: 12, paddingHorizontal: 13, fontSize: 16, color: "#151924", backgroundColor: "white" },
  warning: { padding: 12, borderRadius: 12, backgroundColor: "#FBEEF2" }, warningText: { color: "#8A2943", fontSize: 14, fontWeight: "600" }, loading: { padding: 40, alignItems: "center", gap: 10 },
  hero: { padding: 20, borderRadius: 18, backgroundColor: "#F3F0F8", borderWidth: 1, borderColor: "#D8D0E7", gap: 4 }, eyebrow: { fontSize: 12, fontWeight: "700", color: "#594C8D", letterSpacing: 0.5 }, heroValue: { fontSize: 34, fontWeight: "700", color: "#151924" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metric: { flexGrow: 1, minWidth: 155, flexBasis: 180, padding: 15, borderRadius: 15, gap: 4 }, metricLabel: { fontSize: 13, fontWeight: "700" }, metricValue: { fontSize: 22, fontWeight: "700", color: "#151924" }, metricHelp: { fontSize: 12, color: "#626A78" },
  section: { padding: 17, borderRadius: 18, borderWidth: 1, borderColor: "#E0E3EA", backgroundColor: "white", gap: 9 }, sectionTitle: { fontSize: 18, fontWeight: "700", color: "#151924" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#EEF0F3" }, rowTitle: { fontSize: 15, fontWeight: "700", color: "#151924" }, rowValue: { fontSize: 16, fontWeight: "700", color: "#151924" }, date: { fontSize: 12, color: "#737B89", marginTop: 2 }, empty: { fontSize: 14, color: "#737B89", paddingVertical: 12 },
  export: { minHeight: 50, borderRadius: 14, backgroundColor: "#315FBE", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, exportText: { fontSize: 15, fontWeight: "700", color: "white" },
});
