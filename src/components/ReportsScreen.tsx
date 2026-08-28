import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { supabase } from "@/src/lib/supabase";
import { peso } from "@/src/lib/format";

const publicShopName = (value: string | null | undefined) =>
  value?.toLowerCase().includes("sebu") ? "3D Prints" : value ?? "";

type Period = "daily" | "weekly" | "monthly";
type SaleItem = {
  product_name: string;
  variant_name: string | null;
  selected_letters: string[] | null;
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
          <Ionicons name="chevron-back" size={22} color="#173B5E" />
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
          <Ionicons name="chevron-forward" size={22} color="#173B5E" />
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
  const [voidTarget, setVoidTarget] = useState<SaleRecord | null>(null);
  const [managerPasscode, setManagerPasscode] = useState("");
  const [voiding, setVoiding] = useState(false);
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
          "id,receipt_number,payment_method,total,status,created_at,voided_at,payment_confirmed_at,payment_reference,staff:profiles!sales_created_by_fkey(display_name),sale_items(product_name,variant_name,selected_letters,quantity,unit_price,line_total)",
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
          : i.selected_letters?.length
            ? `${i.product_name} · ${i.selected_letters.join("")}`
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
  const popularLetters = useMemo(() => {
    const map = new Map<string, number>();
    completed.flatMap((sale) => sale.sale_items).forEach((item) => {
      item.selected_letters?.forEach((letter) =>
        map.set(letter, (map.get(letter) ?? 0) + Number(item.quantity)),
      );
    });
    return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
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
          "Selected Letters",
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
              publicShopName(s.staff?.display_name),
              i.product_name,
              i.variant_name ?? "",
              i.selected_letters?.join("") ?? "",
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
                publicShopName(s.staff?.display_name),
                "",
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
  const confirmVoid = async () => {
    if (!voidTarget || !/^\d{4,8}$/.test(managerPasscode))
      return Alert.alert("Enter the manager passcode", "Use the 4 to 8 digit shop passcode.");
    setVoiding(true);
    const { error: voidError } = await supabase.rpc("void_sale_with_passcode", {
      p_sale_id: voidTarget.id,
      p_passcode: managerPasscode,
    });
    setVoiding(false);
    if (voidError) return Alert.alert("Sale not corrected", voidError.message);
    setVoidTarget(null);
    setManagerPasscode("");
    await load();
    Alert.alert("Sale removed from totals", "The original entry remains in the history as cancelled and its stock was restored.");
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
            <Ionicons name="calendar-outline" size={21} color="#4C644F" />
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
          <Ionicons name="chevron-back" size={25} color="#173B5E" />
        </Pressable>
        <View style={s.periodCenter}>
          <Ionicons name="calendar-outline" size={19} color="#4C644F" />
          <Text style={s.periodTitle}>{title}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Next ${period} report`}
          style={s.arrow}
          onPress={() => setOffset((v) => v + 1)}
        >
          <Ionicons name="chevron-forward" size={25} color="#173B5E" />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#354838" />
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
          {popularLetters.length ? (
            <>
              <Text style={s.section}>Letters to make more of</Text>
              {popularLetters.slice(0, 10).map(([letter, units], index) => (
                <View key={letter} style={s.row}>
                  <Text style={s.rank}>{index + 1}</Text>
                  <Text style={s.rowName}>Letter {letter}</Text>
                  <Text style={s.rowValue}>{units} used</Text>
                </View>
              ))}
            </>
          ) : null}
          <Pressable style={s.export} onPress={exportCsv}>
            <Ionicons name="download-outline" size={23} color="#FFF" />
            <Text style={s.exportText}>Export for Excel</Text>
          </Pressable>
          <Text style={s.section}>Sales list</Text>
          {sales.length ? (
            sales.map((sale) => (
              <View key={sale.id} style={s.sale}>
                <View style={s.saleMain}>
                  <Text style={s.saleName}>SALE-{sale.receipt_number}</Text>
                  <Text style={s.rowSmall}>
                    {new Date(sale.created_at).toLocaleString("en-PH")} ·{" "}
                    {publicShopName(sale.staff?.display_name) || "Staff"}
                  </Text>
                  <Text style={s.rowSmall}>
                    {sale.sale_items
                      .map(
                        (i) =>
                          `${i.product_name}${i.variant_name ? ` · ${i.variant_name}` : ""}${i.selected_letters?.length ? ` · ${i.selected_letters.join("")}` : ""} × ${i.quantity}`,
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
                  {sale.status === "completed" ? (
                    <Pressable style={s.voidButton} onPress={() => setVoidTarget(sale)}>
                      <Ionicons name="create-outline" size={17} color="#B84457" />
                      <Text style={s.voidText}>Correct sale</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          ) : (
            <Text style={s.empty}>No sales in this period.</Text>
          )}
        </>
      )}
      <Modal visible={!!voidTarget} transparent animationType="fade" onRequestClose={() => setVoidTarget(null)}>
        <View style={s.modalShade}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Correct this sale?</Text>
            <Text style={s.modalHelp}>SALE-{voidTarget?.receipt_number} will be marked cancelled, removed from totals, and its stock restored. It will not be permanently deleted.</Text>
            <TextInput style={s.passcodeInput} value={managerPasscode} onChangeText={setManagerPasscode} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="Manager passcode" />
            <Pressable style={s.confirmVoid} onPress={confirmVoid} disabled={voiding}><Text style={s.confirmVoidText}>{voiding ? "Correcting…" : "Confirm correction"}</Text></Pressable>
            <Pressable style={s.cancelVoid} onPress={() => { setVoidTarget(null); setManagerPasscode(""); }}><Text style={s.cancelVoidText}>Keep sale</Text></Pressable>
          </View>
        </View>
      </Modal>
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
  title: { fontSize: 28, fontWeight: "800", color: "#11151A", marginTop: 16 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  tab: {
    flex: 1,
    minWidth: 88,
    minHeight: 50,
    justifyContent: "center",
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#E7EFF6",
  },
  tabOn: { backgroundColor: "#102A43" },
  tabText: { fontSize: 13, fontWeight: "900", color: "#697582" },
  tabTextOn: { color: "#FFF" },
  voidButton: { marginTop: 8, minHeight: 38, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 12, backgroundColor: "#FFE8EC" },
  voidText: { color: "#B84457", fontSize: 12, fontWeight: "900" },
  modalShade: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(24,35,52,0.48)" },
  modalCard: { width: "100%", maxWidth: 420, padding: 22, borderRadius: 16, backgroundColor: "#FFF" },
  modalTitle: { color: "#11151A", fontSize: 23, fontWeight: "900" },
  modalHelp: { marginTop: 7, color: "#697582", fontSize: 15, lineHeight: 22 },
  passcodeInput: { minHeight: 56, marginTop: 16, paddingHorizontal: 16, borderWidth: 1.5, borderColor: "#DDE2E5", borderRadius: 17, color: "#16283A", fontSize: 20, textAlign: "center", letterSpacing: 4 },
  confirmVoid: { minHeight: 54, marginTop: 12, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#8E3049" },
  confirmVoidText: { color: "#FFF", fontSize: 16, fontWeight: "900" },
  cancelVoid: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  cancelVoidText: { color: "#697582", fontSize: 15, fontWeight: "800" },
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
    borderColor: "#DDE2E5",
    borderRadius: 12,
    backgroundColor: "#FFF",
  },
  chooseDateText: { color: "#16283A", fontSize: 14, fontWeight: "800" },
  todayButton: {
    minWidth: 78,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#E8EFE8",
  },
  todayText: { color: "#354838", fontSize: 14, fontWeight: "900" },
  calendar: {
    marginTop: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: "#DDE2E5",
    borderRadius: 14,
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
    backgroundColor: "#E7EFF6",
  },
  calendarTitle: { color: "#16283A", fontSize: 16, fontWeight: "900" },
  weekRow: { marginTop: 9, flexDirection: "row" },
  weekDay: {
    width: "14.2857%",
    textAlign: "center",
    color: "#697582",
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
  dayOn: { backgroundColor: "#173B5E" },
  dayText: { color: "#16283A", fontSize: 14, fontWeight: "800" },
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
    borderRadius: 12,
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
    color: "#16283A",
  },
  hero: { padding: 22, borderRadius: 16, backgroundColor: "#0B1E2D" },
  heroLabel: { color: "#DDE8F1", fontWeight: "800" },
  heroValue: { color: "#FFF", fontSize: 34, fontWeight: "900", marginTop: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 10 },
  stat: {
    width: "48%",
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#DDE2E5",
  },
  statLabel: { fontSize: 13, color: "#697582", fontWeight: "700" },
  statValue: {
    fontSize: 20,
    color: "#16283A",
    fontWeight: "900",
    marginTop: 5,
  },
  section: {
    fontSize: 18,
    fontWeight: "800",
    color: "#16283A",
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
    borderColor: "#EEEAE3",
  },
  rank: { width: 22, fontWeight: "900", color: "#29473A" },
  rowName: { flex: 1, fontSize: 15, fontWeight: "800", color: "#16283A" },
  rowSmall: { fontSize: 12, color: "#697582" },
  rowValue: { fontWeight: "900", color: "#102A43" },
  empty: { padding: 14, color: "#697582", backgroundColor: "#FFF" },
  export: {
    minHeight: 60,
    marginTop: 20,
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    borderRadius: 20,
    backgroundColor: "#173B5E",
    alignItems: "center",
  },
  exportText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  sale: {
    width: "100%",
    minHeight: 104,
    padding: 13,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderColor: "#EEEAE3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  saleMain: { flex: 1, minWidth: 0, paddingRight: 6 },
  saleName: { fontSize: 15, fontWeight: "900", color: "#16283A" },
  saleRight: {
    minWidth: 112,
    maxWidth: "38%",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  error: {
    padding: 14,
    color: "#8E3049",
    backgroundColor: "#FFE8EC",
    borderRadius: 17,
  },
});
