import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase";
import { Text } from "@/src/components/AppTypography";
import type { Screen } from "@/src/types";

type Order = {
  total_price_php: number;
  delivery_fee_php: number;
  fulfilment_status: string;
  reseller_preorder_payments: { amount_php: number }[] | null;
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
}: {
  businessId: string;
  onOpen: (screen: Screen) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [ideas, setIdeas] = useState(0);
  const [packages, setPackages] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    const [{ count: ideaCount }, { count: packageCount }, { data }] =
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
            "total_price_php,delivery_fee_php,fulfilment_status,reseller_preorder_payments(amount_php)",
          )
          .eq("business_id", businessId),
      ]);
    setIdeas(ideaCount ?? 0);
    setPackages(packageCount ?? 0);
    setOrders((data ?? []) as Order[]);
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
  const actions: {
    screen: Screen;
    title: string;
    help: string;
    icon: keyof typeof Ionicons.glyphMap;
    value: string;
    color: string;
    soft: string;
  }[] = [
    {
      screen: "sourcing",
      title: "Product Ideas",
      help: "Research products, links, images and costs",
      icon: "bag-handle-outline",
      value: `${ideas}`,
      color: "#315FBE",
      soft: "#EDF3FB",
    },
    {
      screen: "reseller_packages",
      title: "Packages",
      help: "Create reseller tiers and package prices",
      icon: "layers-outline",
      value: `${packages}`,
      color: "#594C8D",
      soft: "#F3F0F8",
    },
    {
      screen: "preorders",
      title: "Pre-orders",
      help: `${summary.awaitingDeposit} waiting for deposit`,
      icon: "receipt-outline",
      value: `${summary.active}`,
      color: "#8A365B",
      soft: "#FAEFF4",
    },
    {
      screen: "reseller_reports",
      title: "Reports",
      help: "Payments, balances and popular packages",
      icon: "bar-chart-outline",
      value: peso(summary.toCollect),
      color: "#1B685C",
      soft: "#EDF6F3",
    },
  ];
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.intro}>
        <Text style={s.eyebrow}>ASTERA WORKSPACE</Text>
        <Text style={s.title}>Reseller overview</Text>
        <Text style={s.help}>
          Move from product idea to paid customer delivery, one step at a time.
        </Text>
      </View>
      {loading ? (
        <View style={s.loading}>
          <ActivityIndicator color="#594C8D" />
          <Text style={s.help}>Opening Astera…</Text>
        </View>
      ) : (
        <View style={s.grid}>
          {actions.map((action) => (
            <Pressable
              key={action.screen}
              style={[s.card, { borderColor: action.color }]}
              onPress={() => onOpen(action.screen)}
            >
              <View style={[s.icon, { backgroundColor: action.soft }]}>
                <Ionicons name={action.icon} size={25} color={action.color} />
              </View>
              <View style={s.flex}>
                <Text style={s.cardTitle}>{action.title}</Text>
                <Text style={s.cardHelp}>{action.help}</Text>
              </View>
              <Text style={[s.value, { color: action.color }]}>
                {action.value}
              </Text>
              <Ionicons name="arrow-forward" size={20} color={action.color} />
            </Pressable>
          ))}
        </View>
      )}
      <View style={s.flow}>
        <Text style={s.flowTitle}>How Astera works</Text>
        <Text style={s.flowText}>
          Product idea → Reseller package → Customer pre-order → Deposit →
          Arrival → Final payment → Delivery
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 1080,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 80,
    gap: 20,
  },
  intro: { gap: 5 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#594C8D",
    letterSpacing: 0.8,
  },
  title: { fontSize: 30, fontWeight: "700", color: "#151924" },
  help: { fontSize: 15, lineHeight: 21, color: "#626A78" },
  loading: { padding: 50, alignItems: "center", gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    flexGrow: 1,
    flexBasis: 420,
    minWidth: 270,
    minHeight: 118,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 17,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "white",
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#151924" },
  cardHelp: { fontSize: 13, lineHeight: 18, color: "#626A78", marginTop: 3 },
  value: { fontSize: 20, fontWeight: "700" },
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
