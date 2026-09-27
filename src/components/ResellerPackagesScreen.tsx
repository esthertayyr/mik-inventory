import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase";
import { Text, TextInput } from "@/src/components/AppTypography";

type Product = {
  id: string;
  name: string;
  selling_price_php: number | null;
  final_cost_sgd: number;
  exchange_rate_sgd_php: number;
  order_quantity: number;
};
type PackageItem = {
  id: string;
  quantity: number;
  choices_note: string | null;
  source_products: { id: string; name: string; selling_price_php: number | null } | null;
};
type Package = {
  id: string;
  name: string;
  tier: string;
  description: string | null;
  package_price_php: number;
  deposit_required_php: number;
  suggested_retail_total_php: number | null;
  availability: "preorder" | "ready_stock";
  lead_time_text: string;
  active: boolean;
  reseller_package_items: PackageItem[] | null;
};
type DraftItem = { productId: string; quantity: string; note: string };

const money = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
const n = (value: string) => Math.max(0, Number(value) || 0);
const tierNames: Record<string, string> = {
  starter: "Starter Pack",
  reseller: "Reseller Pack",
  wholesale: "Wholesale Pack",
  custom: "Custom Package",
};
const suggestions = [
  { tier: "starter", quantity: 5, discount: 0, label: "Starter · 5 each" },
  { tier: "reseller", quantity: 10, discount: 0.05, label: "Reseller · 10 each" },
  { tier: "wholesale", quantity: 20, discount: 0.1, label: "Wholesale · 20 each" },
] as const;

export function ResellerPackagesScreen({
  businessId,
  locationId,
  onBack,
}: {
  businessId: string;
  locationId: string;
  onBack: () => void;
}) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [tier, setTier] = useState("reseller");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [retail, setRetail] = useState("");
  const [availability, setAvailability] = useState<"preorder" | "ready_stock">("preorder");
  const [leadTime, setLeadTime] = useState("Estimated 1–2 months");
  const [items, setItems] = useState<DraftItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: packageRows, error }, { data: productRows }] = await Promise.all([
      supabase
        .from("reseller_packages")
        .select("id,name,tier,description,package_price_php,deposit_required_php,suggested_retail_total_php,availability,lead_time_text,active,reseller_package_items(id,quantity,choices_note,source_products(id,name,selling_price_php))")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false }),
      supabase
        .from("source_products")
        .select("id,name,selling_price_php,final_cost_sgd,exchange_rate_sgd_php,order_quantity")
        .eq("business_id", businessId)
        .neq("idea_stage", "not_proceeding")
        .order("name"),
    ]);
    if (error) Alert.alert("Packages not loaded", error.message);
    setPackages((packageRows ?? []) as unknown as Package[]);
    setProducts((productRows ?? []) as Product[]);
    setLoading(false);
  }, [businessId]);
  useEffect(() => void load(), [load]);

  const selectedRetail = useMemo(
    () =>
      items.reduce((sum, item) => {
        const product = products.find((p) => p.id === item.productId);
        return sum + Number(product?.selling_price_php || 0) * Math.max(1, Math.floor(n(item.quantity) || 1));
      }, 0),
    [items, products],
  );
  const selectedCost = useMemo(
    () =>
      items.reduce((sum, item) => {
        const product = products.find((p) => p.id === item.productId);
        const unitCost = product
          ? (Number(product.final_cost_sgd || 0) /
              Math.max(1, Number(product.order_quantity || 1))) *
            Number(product.exchange_rate_sgd_php || 0)
          : 0;
        return (
          sum +
          unitCost * Math.max(1, Math.floor(n(item.quantity) || 1))
        );
      }, 0),
    [items, products],
  );
  const reset = () => {
    setName("");
    setTier("reseller");
    setDescription("");
    setPrice("");
    setDeposit("");
    setRetail("");
    setAvailability("preorder");
    setLeadTime("Estimated 1–2 months");
    setItems([]);
    setEditingId(null);
  };
  const editPackage = (item: Package) => {
    setEditingId(item.id);
    setName(item.name);
    setTier(item.tier);
    setDescription(item.description ?? "");
    setPrice(`${Number(item.package_price_php)}`);
    setDeposit(`${Number(item.deposit_required_php)}`);
    setRetail(item.suggested_retail_total_php ? `${Number(item.suggested_retail_total_php)}` : "");
    setAvailability(item.availability);
    setLeadTime(item.lead_time_text);
    setItems(
      (item.reseller_package_items ?? []).map((line) => ({
        productId: line.source_products?.id ?? "",
        quantity: `${line.quantity}`,
        note: line.choices_note ?? "",
      })).filter((line) => line.productId),
    );
    setEditing(true);
  };
  const toggleProduct = (productId: string) =>
    setItems((current) =>
      current.some((item) => item.productId === productId)
        ? current.filter((item) => item.productId !== productId)
        : [...current, { productId, quantity: "1", note: "" }],
    );
  const changeItem = (productId: string, field: "quantity" | "note", value: string) =>
    setItems((current) =>
      current.map((item) => (item.productId === productId ? { ...item, [field]: value } : item)),
    );
  const useSuggestion = (suggestion: (typeof suggestions)[number]) => {
    if (!items.length)
      return Alert.alert("Choose products first", "Select what should be inside this package.");
    const next = items.map((item) => ({ ...item, quantity: `${suggestion.quantity}` }));
    const retailTotal = next.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      return sum + Number(product?.selling_price_php || 0) * suggestion.quantity;
    }, 0);
    const packageCost = next.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      const unitCost = product
        ? (Number(product.final_cost_sgd || 0) /
            Math.max(1, Number(product.order_quantity || 1))) *
          Number(product.exchange_rate_sgd_php || 0)
        : 0;
      return sum + unitCost * suggestion.quantity;
    }, 0);
    const packagePrice = Math.round(retailTotal * (1 - suggestion.discount));
    setItems(next);
    setTier(suggestion.tier);
    setName(tierNames[suggestion.tier]);
    if (retailTotal > 0) {
      setRetail(`${Math.round(retailTotal)}`);
      setPrice(`${packagePrice}`);
      setDeposit(`${Math.ceil(Math.max(packagePrice / 2, packageCost))}`);
    }
  };
  const save = async () => {
    if (!name.trim()) return Alert.alert("Package name needed");
    if (!items.length) return Alert.alert("Choose at least one product");
    if (n(price) <= 0) return Alert.alert("Package price needed");
    const requiredDeposit = deposit ? n(deposit) : n(price) / 2;
    if (requiredDeposit <= 0 || requiredDeposit > n(price))
      return Alert.alert("Check the deposit", "The deposit must be more than zero and not higher than the package price.");
    if (selectedCost > 0 && requiredDeposit < selectedCost)
      return Alert.alert(
        "Deposit does not cover the package cost",
        `Set the deposit to at least ${money(Math.ceil(selectedCost))}, or review the products and price.`,
      );
    setSaving(true);
    const payload = {
        business_id: businessId,
        location_id: locationId,
        name: name.trim(),
        tier,
        description: description.trim() || null,
        package_price_php: n(price),
        deposit_required_php: requiredDeposit,
        suggested_retail_total_php: retail ? n(retail) : selectedRetail || null,
        availability,
        lead_time_text: availability === "ready_stock" ? "Ready stock in the Philippines" : leadTime.trim() || "Estimated 1–2 months",
        updated_at: new Date().toISOString(),
      };
    const request = editingId
      ? supabase.from("reseller_packages").update(payload).eq("id", editingId)
      : supabase.from("reseller_packages").insert(payload);
    const { data, error } = await request
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      return Alert.alert("Package not saved", error.message);
    }
    if (editingId) {
      const { error: clearError } = await supabase
        .from("reseller_package_items")
        .delete()
        .eq("package_id", editingId);
      if (clearError) {
        setSaving(false);
        return Alert.alert("Package products not updated", clearError.message);
      }
    }
    const { error: itemError } = await supabase.from("reseller_package_items").insert(
      items.map((item, index) => ({
        package_id: data.id,
        business_id: businessId,
        source_product_id: item.productId,
        quantity: Math.max(1, Math.floor(n(item.quantity) || 1)),
        choices_note: item.note.trim() || null,
        sort_order: index,
      })),
    );
    setSaving(false);
    if (itemError) return Alert.alert("Package products not saved", itemError.message);
    reset();
    setEditing(false);
    await load();
  };
  const setActive = async (item: Package, active: boolean) => {
    const { error } = await supabase
      .from("reseller_packages")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) return Alert.alert("Package not updated", error.message);
    await load();
  };

  if (loading)
    return <View style={s.loading}><ActivityIndicator color="#594C8D" /><Text style={s.help}>Opening packages…</Text></View>;
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Pressable style={s.back} onPress={onBack}><Ionicons name="chevron-back" size={22} color="#151924" /></Pressable>
        <View style={s.flex}><Text style={s.title}>Reseller packages</Text><Text style={s.help}>Build editable packs from your product ideas and set tiered prices.</Text></View>
      </View>
      {!editing ? (
        <>
          <Pressable style={s.primary} onPress={() => { reset(); setEditing(true); }}><Ionicons name="add" size={21} color="white" /><Text style={s.primaryText}>Create a package</Text></Pressable>
          {packages.length === 0 ? <View style={s.empty}><Text style={s.cardTitle}>No packages yet</Text><Text style={s.help}>Create Starter, Reseller or Wholesale packs from saved product ideas.</Text></View> : packages.map((item) => {
            const profit = Number(item.suggested_retail_total_php || 0) - Number(item.package_price_php);
            return <View key={item.id} style={[s.card, !item.active && s.inactive]}>
              <View style={s.cardHead}><View style={s.flex}><Text style={s.cardTitle}>{item.name}</Text><Text style={s.tier}>{tierNames[item.tier] ?? "Custom Package"}</Text></View><Text style={s.price}>{money(Number(item.package_price_php))}</Text></View>
              {item.description ? <Text style={s.help}>{item.description}</Text> : null}
              <View style={s.itemList}>{item.reseller_package_items?.map((line) => <Text key={line.id} style={s.itemText}>{line.quantity} × {line.source_products?.name ?? "Product"}{line.choices_note ? ` · ${line.choices_note}` : ""}</Text>)}</View>
              <View style={s.metrics}><Metric label="Deposit" value={money(Number(item.deposit_required_php))} /><Metric label="Suggested resale" value={money(Number(item.suggested_retail_total_php || 0))} /><Metric label="Possible profit" value={money(Math.max(0, profit))} /></View>
              <View style={s.notice}><Ionicons name={item.availability === "ready_stock" ? "checkmark-circle-outline" : "time-outline"} size={18} color="#594C8D" /><Text style={s.noticeText}>{item.lead_time_text}. Local delivery is charged separately.</Text></View>
              <View style={s.two}><Pressable style={s.secondary} onPress={() => editPackage(item)}><Text style={s.secondaryText}>Edit package</Text></Pressable><Pressable style={s.secondary} onPress={() => void setActive(item, !item.active)}><Text style={s.secondaryText}>{item.active ? "Hide package" : "Show package"}</Text></Pressable></View>
            </View>;
          })}
        </>
      ) : (
        <View style={s.form}>
          <Text style={s.formTitle}>{editingId ? "Edit reseller package" : "New reseller package"}</Text>
          <Field label="Package name · Required" value={name} setValue={setName} placeholder="Example: Starter Keychain Pack" />
          <Text style={s.label}>Package type</Text><View style={s.chips}>{Object.entries(tierNames).map(([id, label]) => <Chip key={id} label={label} active={tier === id} onPress={() => setTier(id)} />)}</View>
          <Field label="What is included · Optional" value={description} setValue={setDescription} placeholder="A short customer-friendly package description" multiline />
          <Text style={s.sectionTitle}>1. Choose products</Text>
          {products.length === 0 ? <Text style={s.help}>Add product ideas first, then return here.</Text> : <View style={s.chips}>{products.map((product) => <Chip key={product.id} label={product.name} active={items.some((item) => item.productId === product.id)} onPress={() => toggleProduct(product.id)} />)}</View>}
          {items.map((item) => { const product = products.find((p) => p.id === item.productId); return <View key={item.productId} style={s.productRow}><View style={s.flex}><Text style={s.productName}>{product?.name}</Text><Text style={s.help}>{product?.selling_price_php ? `${money(Number(product.selling_price_php))} suggested retail each` : "Add price manually below"}</Text></View><View style={s.qty}><Text style={s.label}>Qty</Text><TextInput style={s.qtyInput} value={item.quantity} onChangeText={(value) => changeItem(item.productId, "quantity", value)} keyboardType="number-pad" /></View><Field label="Choices" value={item.note} setValue={(value) => changeItem(item.productId, "note", value)} placeholder="Optional" compact /></View>; })}
          <Text style={s.sectionTitle}>2. Let MIK suggest a tier</Text><Text style={s.help}>Suggestions use the saved retail prices. Review and edit every number before saving.</Text>
          <View style={s.suggestions}>{suggestions.map((item) => <Pressable key={item.tier} style={s.suggestion} onPress={() => useSuggestion(item)}><Text style={s.suggestionText}>{item.label}</Text><Text style={s.suggestionHelp}>{Math.round(item.discount * 100)}% package discount</Text></Pressable>)}</View>
          <Text style={s.sectionTitle}>3. Price and availability</Text>
          <View style={s.two}><View style={s.flex}><Field label="Package price · PHP" value={price} setValue={setPrice} placeholder="0" numeric /></View><View style={s.flex}><Field label="Deposit · PHP" value={deposit} setValue={setDeposit} placeholder={price ? `${n(price) / 2}` : "50%"} numeric /></View></View>
          <Field label="Suggested total resale value · PHP" value={retail} setValue={setRetail} placeholder={selectedRetail ? `${selectedRetail}` : "0"} numeric />
          <View style={s.metrics}><Metric label="Estimated package cost" value={money(selectedCost)} /><Metric label="Price per item" value={money(n(price) / Math.max(1, items.reduce((sum, item) => sum + Math.max(1, Math.floor(n(item.quantity) || 1)), 0)))} /><Metric label="Possible reseller profit" value={money(Math.max(0, (n(retail) || selectedRetail) - n(price)))} /></View>
          <Text style={s.label}>Availability</Text><View style={s.chips}><Chip label="Pre-order" active={availability === "preorder"} onPress={() => setAvailability("preorder")} /><Chip label="Ready stock in PH" active={availability === "ready_stock"} onPress={() => setAvailability("ready_stock")} /></View>
          {availability === "preorder" ? <Field label="Estimated waiting time" value={leadTime} setValue={setLeadTime} placeholder="Estimated 1–2 months" /> : null}
          <View style={s.customerCopy}><Text style={s.customerTitle}>Customer wording</Text><Text style={s.customerText}>{availability === "ready_stock" ? "Ready stock in the Philippines. Pay the required amount to confirm your order. Local delivery is charged separately." : `Choose a reseller package and pay the deposit to confirm. ${leadTime || "Estimated waiting time is 1–2 months"}${(leadTime || "").trim().endsWith(".") ? "" : "."} We will notify you when your order is ready. Local delivery is charged separately.`}</Text></View>
          <View style={s.two}><Pressable style={s.secondary} onPress={() => { reset(); setEditing(false); }}><Text style={s.secondaryText}>Cancel</Text></Pressable><Pressable style={s.primarySmall} disabled={saving} onPress={() => void save()}><Text style={s.primaryText}>{saving ? "Saving…" : editingId ? "Save changes" : "Save package"}</Text></Pressable></View>
        </View>
      )}
    </ScrollView>
  );
}

function Field({ label, value, setValue, placeholder, numeric = false, multiline = false, compact = false }: { label: string; value: string; setValue: (value: string) => void; placeholder: string; numeric?: boolean; multiline?: boolean; compact?: boolean }) {
  return <View style={[s.field, compact && s.compactField]}><Text style={s.label}>{label}</Text><TextInput style={[s.input, multiline && s.multiline]} value={value} onChangeText={setValue} placeholder={placeholder} keyboardType={numeric ? "decimal-pad" : "default"} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} /></View>;
}
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable style={[s.chip, active && s.chipOn]} onPress={onPress}><Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text></Pressable>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text></View>; }

const s = StyleSheet.create({
  page: { padding: 18, paddingBottom: 80, width: "100%", maxWidth: 980, alignSelf: "center", gap: 15 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  flex: { flex: 1 }, header: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: "#E0E3EA", alignItems: "center", justifyContent: "center", backgroundColor: "white" },
  title: { fontSize: 23, fontWeight: "700", color: "#151924" }, help: { fontSize: 14, lineHeight: 20, color: "#626A78" },
  primary: { minHeight: 50, borderRadius: 14, backgroundColor: "#594C8D", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  primarySmall: { minHeight: 47, borderRadius: 12, backgroundColor: "#594C8D", alignItems: "center", justifyContent: "center", paddingHorizontal: 17, flex: 1 },
  primaryText: { fontSize: 15, fontWeight: "700", color: "white" },
  empty: { padding: 28, borderWidth: 1, borderColor: "#E0E3EA", borderRadius: 17, alignItems: "center", gap: 5 },
  card: { padding: 17, borderRadius: 18, borderWidth: 1, borderColor: "#E0E3EA", backgroundColor: "white", gap: 12 }, inactive: { opacity: 0.58 },
  cardHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, cardTitle: { fontSize: 18, fontWeight: "700", color: "#151924" }, tier: { fontSize: 13, color: "#594C8D", fontWeight: "700", marginTop: 3 }, price: { fontSize: 20, fontWeight: "700", color: "#151924" },
  itemList: { gap: 5, padding: 12, borderRadius: 12, backgroundColor: "#F7F7FA" }, itemText: { fontSize: 14, color: "#343A47" },
  metrics: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, metric: { flex: 1, minWidth: 105, padding: 11, borderRadius: 12, backgroundColor: "#F5F3F8", gap: 3 }, metricLabel: { fontSize: 11, color: "#737B89", fontWeight: "700", textTransform: "uppercase" }, metricValue: { fontSize: 16, color: "#151924", fontWeight: "700" },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderRadius: 12, backgroundColor: "#F4F1F8" }, noticeText: { flex: 1, fontSize: 13, lineHeight: 18, color: "#413B55" },
  secondary: { minHeight: 45, borderRadius: 12, borderWidth: 1, borderColor: "#D9DDE5", backgroundColor: "white", alignItems: "center", justifyContent: "center", paddingHorizontal: 15, flex: 1 }, secondaryText: { fontSize: 14, fontWeight: "700", color: "#4F5664" },
  form: { padding: 17, borderRadius: 18, borderWidth: 1, borderColor: "#DED9EB", backgroundColor: "#FAF9FC", gap: 13 }, formTitle: { fontSize: 20, fontWeight: "700", color: "#151924" }, sectionTitle: { fontSize: 17, fontWeight: "700", color: "#151924", marginTop: 7 },
  field: { gap: 6 }, compactField: { minWidth: 115, flex: 0.8 }, label: { fontSize: 13, fontWeight: "600", color: "#343A47" }, input: { minHeight: 46, borderWidth: 1, borderColor: "#D9DDE5", borderRadius: 12, paddingHorizontal: 13, fontSize: 16, color: "#151924", backgroundColor: "white" }, multiline: { minHeight: 82, paddingTop: 11 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "#D9DDE5", backgroundColor: "white" }, chipOn: { backgroundColor: "#594C8D", borderColor: "#594C8D" }, chipText: { fontSize: 13, fontWeight: "600", color: "#4F5664" }, chipTextOn: { color: "white" },
  productRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 10, padding: 12, borderRadius: 13, backgroundColor: "white", borderWidth: 1, borderColor: "#E0E3EA" }, productName: { fontSize: 15, fontWeight: "700", color: "#151924" }, qty: { width: 64, gap: 6 }, qtyInput: { height: 46, borderWidth: 1, borderColor: "#D9DDE5", borderRadius: 12, paddingHorizontal: 10, fontSize: 16, backgroundColor: "white", color: "#151924" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, suggestion: { flexGrow: 1, minWidth: 145, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: "#D9D3E8", backgroundColor: "white" }, suggestionText: { fontSize: 14, fontWeight: "700", color: "#594C8D" }, suggestionHelp: { fontSize: 12, color: "#737B89", marginTop: 3 },
  two: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, customerCopy: { padding: 14, borderRadius: 14, backgroundColor: "#F2F5FB", borderWidth: 1, borderColor: "#D9E1F0", gap: 5 }, customerTitle: { fontSize: 13, fontWeight: "700", color: "#315FBE", textTransform: "uppercase" }, customerText: { fontSize: 14, lineHeight: 21, color: "#343A47" },
});
