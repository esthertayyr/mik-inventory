import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { supabase } from "@/src/lib/supabase";
import { peso } from "@/src/lib/format";

type Period = "daily" | "weekly" | "monthly";
type SaleItem = {
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};
type SaleRecord = {
  id: string;
  receipt_number: number;
  payment_method: "cash" | "gcash";
  total: number;
  status: "completed" | "voided";
  created_at: string;
  voided_at: string | null;
  payment_confirmed_at: string | null;
  payment_reference: string | null;
  staff: { display_name: string } | null;
  sale_items: SaleItem[];
};
type DamageRecord = {
  quantity_change: number;
  created_at: string;
  note: string | null;
  products: { name: string } | null;
};

function bounds(period: Period, offset: number, exactDate: Date | null) {
  const now = period === "daily" && exactDate ? exactDate : new Date();
  let start: Date;
  let end: Date;
  if (period === "daily") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (period === "weekly") {
    const monday = (now.getDay() + 6) % 7;
    start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - monday + offset * 7,
    );
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  }
  return { start, end };
}

const dateText = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
const csvCell = (value: unknown) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

function CalendarPicker({
  month,
  selected,
  onMonth,
  onSelect,
}: {
  month: Date;
  selected: Date;
  onMonth: (date: Date) => void;
  onSelect: (date: Date) => void;
}) {
  const year = month.getFullYear(),
    monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const leading = (first.getDay() + 6) % 7;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from(
      { length: count },
      (_, i) => new Date(year, monthIndex, i + 1),
    ),
  ];
  while (cells.length % 7) cells.push(null);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  return (
    <View style={s.calendar}>
      <View style={s.calendarTop}>
        <Pressable
          accessibilityLabel="Previous month"
          style={s.calendarArrow}
          onPress={() => onMonth(new Date(year, monthIndex - 1, 1))}
        >
          <Ionicons name="chevron-back" size={22} color="#5577F6" />
        </Pressable>
        <Text style={s.calendarTitle}>
          {new Intl.DateTimeFormat("en-PH", {
            month: "long",
            year: "numeric",
          }).format(month)}
        </Text>
        <Pressable
          accessibilityLabel="Next month"
          style={s.calendarArrow}
          onPress={() => onMonth(new Date(year, monthIndex + 1, 1))}
        >
          <Ionicons name="chevron-forward" size={22} color="#5577F6" />
        </Pressable>
      </View>
      <View style={s.weekRow}>
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
          <Text key={`${day}-${i}`} style={s.weekDay}>
            {day}
          </Text>
        ))}
      </View>
      <View style={s.calendarGrid}>
        {cells.map((date, i) =>
          date ? (
            <Pressable
              key={date.toISOString()}
              accessibilityLabel={dateText(date)}
              style={[s.day, same(date, selected) && s.dayOn]}
              onPress={() => onSelect(date)}
            >
              <Text style={[s.dayText, same(date, selected) && s.dayTextOn]}>
                {date.getDate()}
              </Text>
            </Pressable>
          ) : (
            <View key={`blank-${i}`} style={s.day} />
          ),
        )}
      </View>
    </View>
  );
}

export function ReportsScreen({
  locationId,
  hideTitle = false,
}: {
  locationId: string;
  hideTitle?: boolean;
}) {
  const [period, setPeriod] = useState<Period>("daily");
  const [offset, setOffset] = useState(0);
  const [exactDate, setExactDate] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [damage, setDamage] = useState<DamageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const range = useMemo(
    () => bounds(period, offset, exactDate),
    [period, offset, exactDate],
  );
  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError("");
    const start = range.start.toISOString(),
      end = range.end.toISOString();
    const [
      { data: saleData, error: saleError },
      { data: damageData, error: damageError },
    ] = await Promise.all([
      supabase
        .from("sales")
        .select(
          "id,receipt_number,payment_method,total,status,created_at,voided_at,payment_confirmed_at,payment_reference,staff:profiles!sales_created_by_fkey(display_name),sale_items(product_name,variant_name,quantity,unit_price,line_total)",
        )
        .eq("location_id", locationId)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false }),
      supabase
        .from("inventory_movements")
        .select("quantity_change,created_at,note,products(name)")
        .eq("location_id", locationId)
        .eq("movement_type", "damage")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false }),
    ]);
    if (saleError || damageError)
      setError(
        saleError?.message ??
          damageError?.message ??
          "Report could not be loaded",
      );
    setSales((saleData ?? []) as unknown as SaleRecord[]);
    setDamage((damageData ?? []) as unknown as DamageRecord[]);
    setLoading(false);
  }, [locationId, range.start.getTime(), range.end.getTime()]);
  useEffect(() => {
    load();
  }, [load]);

  const completed = sales.filter((s) => s.status === "completed");
  const total = completed.reduce((n, s) => n + Number(s.total), 0);
  const cash = completed
    .filter((s) => s.payment_method === "cash")
    .reduce((n, s) => n + Number(s.total), 0);
  const gcash = completed
    .filter((s) => s.payment_method === "gcash")
    .reduce((n, s) => n + Number(s.total), 0);
  const itemsSold = completed.reduce(
    (n, s) => n + s.sale_items.reduce((a, i) => a + Number(i.quantity), 0),
    0,
  );
  const damaged = Math.abs(
    damage.reduce((n, m) => n + Number(m.quantity_change), 0),
  );
  const cancelled = sales.filter((s) => s.status === "voided").length;
  const average = completed.length ? total / completed.length : 0;
  const products = useMemo(() => {
    const map = new Map<
      string,
      { name: string; units: number; revenue: number }
    >();
    completed
      .flatMap((s) => s.sale_items)
      .forEach((i) => {
        const displayName = i.variant_name
          ? `${i.product_name} · ${i.variant_name}`
          : i.product_name;
        const old = map.get(displayName) ?? {
          name: displayName,
          units: 0,
          revenue: 0,
        };
        old.units += Number(i.quantity);
        old.revenue += Number(i.line_total);
        map.set(displayName, old);
      });
    return [...map.values()].sort(
      (a, b) => b.units - a.units || b.revenue - a.revenue,
    );
  }, [completed]);
  const daily = useMemo(() => {
    const rows = [];
    for (
      let d = new Date(range.start);
      d < range.end;
      d.setDate(d.getDate() + 1)
    ) {
      const key = d.toLocaleDateString("en-CA");
      const matches = completed.filter(
        (s) => new Date(s.created_at).toLocaleDateString("en-CA") === key,
      );
      rows.push({
        label: new Intl.DateTimeFormat("en-PH", { weekday: "long" }).format(d),
        total: matches.reduce((n, s) => n + Number(s.total), 0),
        transactions: matches.length,
      });
    }
    return rows;
  }, [completed, range.start.getTime(), range.end.getTime()]);
  const title =
    period === "daily"
      ? dateText(range.start)
      : period === "weekly"
        ? `${dateText(range.start)} – ${dateText(new Date(range.end.getTime() - 1))}`
        : new Intl.DateTimeFormat("en-PH", {
            month: "long",
            year: "numeric",
          }).format(range.start);

  const exportCsv = async () => {
    try {
      const summary = [
        ["MIK SALES REPORT"],
        ["Period", title],
        ["Total Sales", total],
        ["Cash", cash],
        ["GCash", gcash],
        ["Transactions", completed.length],
        ["Items Sold", itemsSold],
        ["Damaged Items", damaged],
        ["Cancelled Sales", cancelled],
        ["Average Transaction", average],
        [],
        [
          "Receipt",
          "Date",
          "Time",
          "Staff",
          "Product",
          "Variant",
          "Quantity",
          "Unit Price",
          "Line Total",
          "Sale Total",
          "Payment",
          "Payment Confirmed",
          "GCash Reference",
          "Status",
        ],
      ];
      const details = sales.flatMap((s) =>
        s.sale_items.length
          ? s.sale_items.map((i) => [
              `SALE-${s.receipt_number}`,
              new Date(s.created_at).toLocaleDateString("en-PH"),
              new Date(s.created_at).toLocaleTimeString("en-PH", {
                hour: "2-digit",
                minute: "2-digit",
              }),
              s.staff?.display_name ?? "",
              i.product_name,
              i.variant_name ?? "",
              i.quantity,
              i.unit_price,
              i.line_total,
              s.total,
              s.payment_method.toUpperCase(),
              s.payment_confirmed_at ? "YES" : "",
              s.payment_reference ?? "",
              s.status.toUpperCase(),
            ])
          : [
              [
                `SALE-${s.receipt_number}`,
                new Date(s.created_at).toLocaleDateString("en-PH"),
                new Date(s.created_at).toLocaleTimeString("en-PH", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                s.staff?.display_name ?? "",
                "",
                "",
                0,
                0,
                0,
                s.total,
                s.payment_method.toUpperCase(),
                s.payment_confirmed_at ? "YES" : "",
                s.payment_reference ?? "",
                s.status.toUpperCase(),
              ],
            ],
      );
      const csv =
        "\uFEFF" +
        [...summary, ...details]
          .map((row) => row.map(csvCell).join(","))
          .join("\n");
      const filename = `mik-${period}-sales-${range.start.toLocaleDateString("en-CA")}.csv`;
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
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
      file.write(csv);
      await Sharing.shareAsync(file.uri);
    } catch {
      Alert.alert(
        "Export not created",
        "Please try again. If the problem continues, check that file sharing is allowed on this device.",
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={s.page}>
      {hideTitle ? null : <Text style={s.title}>Sales Reports</Text>}
      <View style={s.tabs}>
        {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
          <Pressable
            key={p}
            style={[s.tab, period === p && s.tabOn]}
            onPress={() => {
              setPeriod(p);
              setOffset(0);
              setCalendarOpen(false);
            }}
          >
            <Text style={[s.tabText, period === p && s.tabTextOn]}>
              {p.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      {period === "daily" ? (
        <View style={s.dateTools}>
          <Pressable
            style={s.chooseDate}
            onPress={() => {
              setCalendarMonth(
                new Date(range.start.getFullYear(), range.start.getMonth(), 1),
              );
              setCalendarOpen((v) => !v);
            }}
          >
            <Ionicons name="calendar-outline" size={21} color="#2E9C68" />
            <Text style={s.chooseDateText}>Choose exact date</Text>
          </Pressable>
          <Pressable
            style={s.todayButton}
            onPress={() => {
              setExactDate(null);
              setOffset(0);
              setCalendarOpen(false);
            }}
          >
            <Text style={s.todayText}>Today</Text>
          </Pressable>
        </View>
      ) : null}
      {period === "daily" && calendarOpen ? (
        <CalendarPicker
          month={calendarMonth}
          selected={range.start}
          onMonth={setCalendarMonth}
          onSelect={(date) => {
            setExactDate(date);
            setOffset(0);
            setCalendarOpen(false);
          }}
        />
      ) : null}
      <View style={s.periodNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Previous ${period} report`}
          style={s.arrow}
          onPress={() => setOffset((v) => v - 1)}
        >
          <Ionicons name="chevron-back" size={25} color="#5577F6" />
        </Pressable>
        <View style={s.periodCenter}>
          <Ionicons name="calendar-outline" size={19} color="#2E9C68" />
          <Text style={s.periodTitle}>{title}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Next ${period} report`}
          style={s.arrow}
          onPress={() => setOffset((v) => v + 1)}
        >
          <Ionicons name="chevron-forward" size={25} color="#5577F6" />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#176B45" />
      ) : error ? (
        <Text style={s.error}>{error}</Text>
      ) : (
        <>
          <View style={s.hero}>
            <Text style={s.heroLabel}>TOTAL SALES</Text>
            <Text style={s.heroValue}>{peso(total)}</Text>
          </View>
          <View style={s.grid}>
            <Stat label="Cash" value={peso(cash)} />
            <Stat label="GCash" value={peso(gcash)} />
            <Stat label="Transactions" value={String(completed.length)} />
            <Stat label="Items sold" value={String(itemsSold)} />
            <Stat label="Damaged" value={String(damaged)} />
            <Stat label="Cancelled" value={String(cancelled)} />
            <Stat label="Average sale" value={peso(average)} />
          </View>
          {period === "weekly" ? (
            <>
              <Text style={s.section}>Sales by day</Text>
              {daily.map((d) => (
                <View key={d.label} style={s.row}>
                  <Text style={s.rowName}>{d.label}</Text>
                  <Text style={s.rowSmall}>
                    {d.transactions} sale{d.transactions === 1 ? "" : "s"}
                  </Text>
                  <Text style={s.rowValue}>{peso(d.total)}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Text style={s.section}>Best-selling products</Text>
          {products.length ? (
            products.slice(0, 10).map((p, i) => (
              <View key={p.name} style={s.row}>
                <Text style={s.rank}>{i + 1}</Text>
                <Text style={s.rowName}>{p.name}</Text>
                <Text style={s.rowSmall}>{p.units} sold</Text>
                <Text style={s.rowValue}>{peso(p.revenue)}</Text>
              </View>
            ))
          ) : (
            <Text style={s.empty}>No product sales in this period.</Text>
          )}
          <Pressable style={s.export} onPress={exportCsv}>
            <Ionicons name="download-outline" size={23} color="#FFF" />
            <Text style={s.exportText}>Export for Excel</Text>
          </Pressable>
          <Text style={s.section}>Sales list</Text>
          {sales.length ? (
            sales.map((sale) => (
              <View key={sale.id} style={s.sale}>
                <View>
                  <Text style={s.rowName}>SALE-{sale.receipt_number}</Text>
                  <Text style={s.rowSmall}>
                    {new Date(sale.created_at).toLocaleString("en-PH")} ·{" "}
                    {sale.staff?.display_name ?? "Staff"}
                  </Text>
                  <Text style={s.rowSmall}>
                    {sale.sale_items
                      .map(
                        (i) =>
                          `${i.product_name}${i.variant_name ? ` · ${i.variant_name}` : ""} × ${i.quantity}`,
                      )
                      .join(", ")}
                  </Text>
                </View>
                <View style={s.saleRight}>
                  <Text style={s.rowValue}>{peso(Number(sale.total))}</Text>
                  <Text style={s.rowSmall}>
                    {sale.payment_method.toUpperCase()} ·{" "}
                    {sale.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={s.empty}>No sales in this period.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  page: { paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: "900", color: "#24324A", marginTop: 16 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 10 },
  tab: {
    flex: 1,
    minHeight: 50,
    justifyContent: "center",
    borderRadius: 17,
    alignItems: "center",
    backgroundColor: "#E9EEFF",
  },
  tabOn: { backgroundColor: "#5577F6" },
  tabText: { fontSize: 13, fontWeight: "900", color: "#68758B" },
  tabTextOn: { color: "#FFF" },
  dateTools: { marginTop: 10, flexDirection: "row", gap: 8 },
  chooseDate: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#DDE3F0",
    borderRadius: 17,
    backgroundColor: "#FFF",
  },
  chooseDateText: { color: "#24324A", fontSize: 14, fontWeight: "800" },
  todayButton: {
    minWidth: 78,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "#E5F7EE",
  },
  todayText: { color: "#237A51", fontSize: 14, fontWeight: "900" },
  calendar: {
    marginTop: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: "#DDE3F0",
    borderRadius: 20,
    backgroundColor: "#FFF",
  },
  calendarTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarArrow: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#E9EEFF",
  },
  calendarTitle: { color: "#24324A", fontSize: 16, fontWeight: "900" },
  weekRow: { marginTop: 9, flexDirection: "row" },
  weekDay: {
    width: "14.2857%",
    textAlign: "center",
    color: "#68758B",
    fontSize: 12,
    fontWeight: "900",
  },
  calendarGrid: { marginTop: 4, flexDirection: "row", flexWrap: "wrap" },
  day: {
    width: "14.2857%",
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  dayOn: { backgroundColor: "#5577F6" },
  dayText: { color: "#24324A", fontSize: 14, fontWeight: "800" },
  dayTextOn: { color: "#FFF" },
  periodNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginVertical: 14,
  },
  arrow: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  periodCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  periodTitle: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: "#24324A",
  },
  hero: { padding: 20, borderRadius: 22, backgroundColor: "#3852B3" },
  heroLabel: { color: "#DDE4FF", fontWeight: "800" },
  heroValue: { color: "#FFF", fontSize: 34, fontWeight: "900", marginTop: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 10 },
  stat: {
    width: "48%",
    padding: 15,
    borderRadius: 18,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#DDE3F0",
  },
  statLabel: { fontSize: 13, color: "#68758B", fontWeight: "700" },
  statValue: {
    fontSize: 20,
    color: "#24324A",
    fontWeight: "900",
    marginTop: 5,
  },
  section: {
    fontSize: 18,
    fontWeight: "900",
    color: "#24324A",
    marginTop: 22,
    marginBottom: 7,
  },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderColor: "#EDF1F8",
  },
  rank: { width: 22, fontWeight: "900", color: "#5577F6" },
  rowName: { flex: 1, fontSize: 15, fontWeight: "800", color: "#24324A" },
  rowSmall: { fontSize: 12, color: "#68758B" },
  rowValue: { fontWeight: "900", color: "#5577F6" },
  empty: { padding: 14, color: "#68758B", backgroundColor: "#FFF" },
  export: {
    minHeight: 60,
    marginTop: 20,
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    borderRadius: 20,
    backgroundColor: "#5577F6",
    alignItems: "center",
  },
  exportText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  sale: {
    padding: 13,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderColor: "#EDF1F8",
    flexDirection: "row",
    gap: 10,
  },
  saleRight: { alignItems: "flex-end", maxWidth: "35%" },
  error: {
    padding: 14,
    color: "#C94F62",
    backgroundColor: "#FFE8EC",
    borderRadius: 17,
  },
});
