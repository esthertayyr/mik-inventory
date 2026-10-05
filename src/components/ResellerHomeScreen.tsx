import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase";
import { Text } from "@/src/components/AppTypography";
import type { Screen } from "@/src/types";

type Order = {
  direct_sale: boolean;
  total_price_php: number;
  delivery_fee_php: number;
  fulfilment_status: string;
  reseller_preorder_payments: { amount_php: number; payment_date:string }[] | null;
};
const peso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);

export function ResellerHomeScreen({
  businessId,
  onOpen,
  canManageWebsite = false,
  permissions,
}: {
  businessId: string;
  onOpen: (screen: Screen) => void;
  canManageWebsite?: boolean;
  permissions?: string[];
}) {
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const [loading, setLoading] = useState(true);
  const [ideas, setIdeas] = useState(0);
  const [packages, setPackages] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [period,setPeriod]=useState<'today'|'month'>('month');
  const [tradeRows,setTradeRows]=useState<{kind:string;amount_php:number;payment_date:string|null;status:string}[]>([]);
  const [expenseRows,setExpenseRows]=useState<{amount:number;expense_date:string}[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    const [{ count: ideaCount }, { count: packageCount }, { data },trades,expenses] =
      await Promise.all([
        supabase
          .from("source_products")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .neq("idea_stage", "not_proceeding"),
        supabase
          .from("reseller_packages")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("active", true),
        supabase
          .from("reseller_preorders")
          .select(
            "direct_sale,total_price_php,delivery_fee_php,fulfilment_status,reseller_preorder_payments(amount_php,payment_date)",
          )
          .eq("business_id", businessId),
        supabase.from('reseller_trade_entries').select('kind,amount_php,payment_date,status').eq('business_id',businessId),
        supabase.from('expenses').select('amount,expense_date').eq('business_id',businessId),
      ]);
    setIdeas(ideaCount ?? 0);
    setPackages(packageCount ?? 0);
    setOrders((data ?? []) as Order[]);
    setTradeRows(trades.data??[]);setExpenseRows(expenses.data??[]);
    setLoading(false);
  }, [businessId]);
  useEffect(() => void load(), [load]);
  const summary = useMemo(() => {
    const active = orders.filter(
      (order) =>
        !["delivered", "cancelled"].includes(order.fulfilment_status),
    );
    const toCollect = active.reduce((sum, order) => {
      const paid = (order.reseller_preorder_payments ?? []).reduce(
        (amount, payment) => amount + Number(payment.amount_php),
        0,
      );
      return (
        sum +
        Math.max(
          0,
          Number(order.total_price_php) + Number(order.delivery_fee_php) - paid,
        )
      );
    }, 0);
    const awaitingDeposit = active.filter(
      (order) => order.fulfilment_status === "awaiting_deposit",
    ).length;
    return { active: active.length, toCollect, awaitingDeposit };
  }, [orders]);
  const current=new Date();const localToday=`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
  const inPeriod=(date:string|null)=>!!date&&(period==='today'?date===localToday:date.slice(0,7)===localToday.slice(0,7));
  const salesMoney=orders.filter(row=>row.direct_sale).flatMap(row=>row.reseller_preorder_payments??[]).filter(row=>inPeriod(row.payment_date)).reduce((sum,row)=>sum+Number(row.amount_php),0)+tradeRows.filter(row=>row.kind==='sale'&&row.status!=='cancelled'&&inPeriod(row.payment_date)).reduce((sum,row)=>sum+Number(row.amount_php),0);
  const paidPurchases=tradeRows.filter(row=>row.kind==='purchase'&&row.status!=='cancelled'&&inPeriod(row.payment_date)).reduce((sum,row)=>sum+Number(row.amount_php),0);
  const orderMoney=orders.filter(row=>!row.direct_sale).flatMap(row=>row.reseller_preorder_payments??[]).filter(row=>inPeriod(row.payment_date)).reduce((sum,row)=>sum+Number(row.amount_php),0);
  const spent=expenseRows.filter(row=>inPeriod(row.expense_date)).reduce((sum,row)=>sum+Number(row.amount),0);
  const actions: {
    screen: Screen;
    title: string;
    help: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    soft: string;
  }[] = [
    ...(canManageWebsite ? [{screen: "website" as Screen, title: "Website", help: "Edit homepage text and photos", icon: "globe-outline" as const, color: "#650f1c", soft: "#f8edf0"}] : []),
    {
      screen: "sourcing",
      title: "Products",
      help: "Save products, links, photos and costs",
      icon: "bag-handle-outline",
      color: "#315FBE",
      soft: "#EDF3FB",
    },
    {
      screen: "reseller_packages",
      title: "Packages",
      help: "Create reseller tiers and package prices",
      icon: "layers-outline",
      color: "#594C8D",
      soft: "#F3F0F8",
    },
    {
      screen: "preorders",
      title: "Pre-orders",
      help: `${summary.awaitingDeposit} waiting for deposit`,
      icon: "receipt-outline",
      color: "#8A365B",
      soft: "#FAEFF4",
    },
    {
      screen: "reseller_reports",
      title: "Reports",
      help: "Payments, balances and popular packages",
      icon: "bar-chart-outline",
      color: "#1B685C",
      soft: "#EDF6F3",
    },
    {screen:"reseller_sales",title:"Sales",help:"Record a fully paid direct sale",icon:"cart-outline",color:"#315FBE",soft:"#EDF3FB"},
    {screen:"reseller_purchases",title:"Supplier purchases",help:"Track buying costs and arrivals",icon:"cube-outline",color:"#594C8D",soft:"#F3F0F8"},
    {screen:"expenses",title:"Expenses",help:"Record other business spending",icon:"wallet-outline",color:"#8A365B",soft:"#FAEFF4"},
    {screen:"reseller_stock",title:"Stock and printing",help:"Available pieces, incoming stock and printing jobs",icon:"grid-outline",color:"#1B685C",soft:"#EDF6F3"},
  ];
  const groups = [
    {
      title: "Start here",
      help: "Save products and build packages for customers.",
      color: "#315FBE",
      actions: actions.filter(action => ["sourcing","reseller_packages"].includes(action.screen)),
    },
    {
      title: "Customer orders & money",
      help: "Track pre-orders, payments, balances and delivery.",
      color: "#8A365B",
      actions: actions.filter(action => ["preorders", "reseller_sales", "reseller_reports", "expenses"].includes(action.screen)),
    },
  ];
  groups.push({title:"Buying and stock",help:"Receive purchases or finish printing to add available stock. Pack offline.",color:"#594C8D",actions:actions.filter(action=>["reseller_purchases","reseller_stock"].includes(action.screen))});
  const allowed=(screen:Screen)=>!permissions || permissions.includes(screen==="reseller_sales"?"sell":screen==="preorders"?"orders":["expenses","reseller_reports"].includes(screen)?"reports":"products");
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.intro}>
        <Text style={s.eyebrow}>TODAY · {today.toUpperCase()}</Text>
        <Text style={s.title}>Business overview</Text>
        <Text style={s.help}>
          Everything for VIAE, organised by task.
        </Text>
      </View>
      {canManageWebsite ? <Pressable accessibilityRole="button" accessibilityLabel="Open VIAE website controls" style={[s.card, compact && s.cardCompact]} onPress={() => onOpen("website")}>
        <View style={[s.icon, {backgroundColor:"#f8edf0"}]}><Ionicons name="globe-outline" size={25} color="#650f1c" /></View>
        <View style={s.flex}><Text style={s.cardTitle}>Website controls</Text><Text style={s.sectionHelp}>Edit homepage text and photos. Preview and publish.</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#650f1c" />
      </Pressable> : null}
      {loading ? (
        <View style={s.loading}>
          <ActivityIndicator color="#594C8D" />
          <Text style={s.help}>Opening VIAE…</Text>
        </View>
      ) : (
        <>
          {allowed('reseller_reports')?<><View style={s.grid}>{(['today','month'] as const).map(value=><Pressable key={value} style={[s.icon,{width:140,backgroundColor:period===value?'#594C8D':'#F3F0F8'}]} onPress={()=>setPeriod(value)}><Text style={{fontSize:14,fontWeight:'600',color:period===value?'white':'#594C8D'}}>{value==='today'?'Today':current.toLocaleDateString('en-US',{month:'short',year:'numeric'})}</Text></Pressable>)}</View><View style={s.summaryGrid}>
            <OverviewCard compact={compact} label="Direct sales" value={peso(salesMoney)} help="View reports" color="#315FBE" soft="#EDF3FB" onPress={()=>onOpen('reseller_reports')}/>
            <OverviewCard compact={compact} label="Order money received" value={peso(orderMoney)} help="Customer payments" color="#594C8D" soft="#F3F0F8" onPress={()=>onOpen('reseller_reports')}/>
            <OverviewCard compact={compact} label="Purchases and expenses" value={peso(paidPurchases+spent)} help="Money paid out" color="#8A365B" soft="#FAEFF4" onPress={()=>onOpen('reseller_reports')}/>
            <OverviewCard compact={compact} label="Money after spending" value={peso(salesMoney+orderMoney-paidPurchases-spent)} help="Cash flow, not profit" color="#1B685C" soft="#EDF6F3" onPress={()=>onOpen('reseller_reports')}/>
          </View></>:null}
          <View style={s.summaryGrid}>
            {allowed('sourcing')?<OverviewCard compact={compact} label="Products" value={`${ideas}`} help="Saved products" color="#315FBE" soft="#EDF3FB" onPress={() => onOpen("sourcing")} />:null}
            {allowed('preorders')?<OverviewCard compact={compact} label="Open pre-orders" value={`${summary.active}`} help={`${summary.awaitingDeposit} awaiting deposit`} color="#8A365B" soft="#FAEFF4" onPress={() => onOpen("preorders")} />:null}
            {allowed('reseller_reports')?<OverviewCard compact={compact} label="Still to collect" value={peso(summary.toCollect)} help="Customer balances" color="#1B685C" soft="#EDF6F3" onPress={() => onOpen("reseller_reports")} />:null}
          </View>
          {groups.map((group) => (
          <View key={group.title} style={s.section}>
            <View style={s.sectionHeading}>
              <View style={[s.sectionMark, { backgroundColor: group.color }]} />
              <View style={s.flex}>
                <Text style={s.sectionTitle}>{group.title}</Text>
                <Text style={s.sectionHelp}>{group.help}</Text>
              </View>
            </View>
            <View style={s.grid}>
              {group.actions.filter(action=>allowed(action.screen)).map((action) => (
                <Pressable key={action.screen} style={[s.card, compact && s.cardCompact]} onPress={() => onOpen(action.screen)}>
                  <View style={[s.icon, { backgroundColor: action.soft }]}>
                    <Ionicons name={action.icon} size={25} color={action.color} />
                  </View>
                  <View style={s.flex}>
                    <Text style={s.cardTitle}>{action.title}</Text>
                    <Text style={s.cardHelp} numberOfLines={compact ? 2 : undefined}>{action.help}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={action.color} />
                </Pressable>
              ))}
            </View>
          </View>
          ))}
        </>
      )}
      <View style={s.flow}>
        <Text style={s.flowTitle}>How VIAE works</Text>
        <Text style={s.flowText}>
          Official products → Reseller package → Customer pre-order → Deposit →
          Arrival → Final payment → Delivery
        </Text>
      </View>
    </ScrollView>
  );
}

function OverviewCard({ compact, label, value, help, color, soft, onPress }: { compact: boolean; label: string; value: string; help: string; color: string; soft: string; onPress: () => void }) {
  return (
    <Pressable style={[s.summaryCard, compact && s.summaryCardCompact, { backgroundColor: soft, borderColor: `${color}33` }]} onPress={onPress}>
      <Text style={[s.summaryLabel, { color }]}>{label}</Text>
      <Text style={s.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[s.summaryHelp, { color }]}>{help}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: {
    width: "100%",
    boxSizing: "border-box",
    maxWidth: 1080,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 80,
    gap: 16,
  },
  intro: { gap: 5, paddingTop: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#737B89",
    letterSpacing: 1.5,
  },
  title: { fontSize: 30, fontWeight: "600", color: "#151924", letterSpacing: -0.6 },
  help: { fontSize: 15, lineHeight: 21, color: "#626A78" },
  loading: { padding: 50, alignItems: "center", gap: 10 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryCard: { flexGrow: 1, flexBasis: 220, minWidth: 145, minHeight: 112, padding: 14, borderRadius: 14, borderWidth: 1, justifyContent: "space-between" },
  summaryCardCompact: { flexBasis: "45%", minWidth: 0, minHeight: 100, padding: 12 },
  summaryLabel: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  summaryValue: { marginVertical: 4, fontSize: 25, lineHeight: 31, fontWeight: "700", color: "#151924" },
  summaryHelp: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  section: { gap: 12, marginTop: 4 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionMark: { width: 4, minHeight: 38, borderRadius: 999 },
  sectionTitle: { fontSize: 19, fontWeight: "700", color: "#151924" },
  sectionHelp: { fontSize: 13, lineHeight: 18, color: "#626A78", marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    flexGrow: 1,
    flexBasis: 420,
    minWidth: 270,
    boxSizing: "border-box",
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 17,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E0E3EA",
    backgroundColor: "white",
  },
  cardCompact: { flexBasis: "100%", minWidth: 0 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#151924" },
  cardHelp: { fontSize: 13, lineHeight: 18, color: "#626A78", marginTop: 3 },
  flow: {
    padding: 17,
    borderRadius: 17,
    backgroundColor: "#F5F3F8",
    borderWidth: 1,
    borderColor: "#DDD7E9",
    gap: 5,
  },
  flowTitle: { fontSize: 16, fontWeight: "700", color: "#151924" },
  flowText: { fontSize: 14, lineHeight: 21, color: "#4F5664" },
});
