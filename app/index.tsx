import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabase";
import { peso, shortDate } from "@/src/lib/format";
import { ReportsScreen } from "@/src/components/ReportsScreen";
import type {
  Business,
  CartItem,
  Category,
  Location,
  PaymentMethod,
  Product,
  ProductVariant,
  Profile,
  Role,
  Sale,
  Screen,
} from "@/src/types";

const C = {
  ink: "#20324D",
  muted: "#68768A",
  green: "#4775E8",
  dark: "#2E4F9B",
  soft: "#EAF1FF",
  accent: "#2E9C68",
  accentDark: "#237A51",
  accentSoft: "#E5F7EE",
  teal: "#2C91A3",
  tealSoft: "#E4F5F7",
  purple: "#7564C0",
  purpleSoft: "#F0ECFA",
  cream: "#F7FAFF",
  white: "#FFFFFF",
  border: "#DCE4F0",
  orange: "#B96A32",
  orangeSoft: "#FFF1E3",
  red: "#C94F62",
  redSoft: "#FFE8EC",
};
type Icon = keyof typeof Ionicons.glyphMap;
function categoryIcon(name: string): Icon {
  const n = name.toLowerCase();
  if (n.includes("keyboard")) return "keypad";
  if (n.includes("fidget")) return "sync";
  if (n.includes("keychain")) return "key";
  if (n.includes("home") || n.includes("gift")) return "home";
  return "cube";
}
function productIcon(name: string, category = ""): Icon {
  const n = `${name} ${category}`.toLowerCase();
  if (n.includes("keychain") || n.includes("leather") || n.includes("paracord"))
    return "key";
  if (n.includes("keyboard") || n.includes("clicker")) return "keypad";
  if (n.includes("lamp") || n.includes("candle")) return "bulb";
  if (n.includes("vase") || n.includes("flower")) return "flower";
  if (n.includes("pen") || n.includes("pencil")) return "pencil";
  if (n.includes("phone") || n.includes("homepod")) return "phone-portrait";
  if (n.includes("organizer") || n.includes("holder"))
    return "file-tray-stacked";
  if (n.includes("dragon")) return "flame";
  if (n.includes("octopus") || n.includes("starfish")) return "fish";
  if (
    n.includes("bear") ||
    n.includes("puppy") ||
    n.includes("owl") ||
    n.includes("gorilla")
  )
    return "paw";
  if (n.includes("heart")) return "heart";
  if (n.includes("pickleball") || n.includes("paddle")) return "tennisball";
  if (n.includes("skull") || n.includes("skeleton")) return "skull";
  if (n.includes("ice cream")) return "ice-cream";
  if (n.includes("dumpling")) return "restaurant";
  if (n.includes("egg")) return "egg";
  if (
    n.includes("name") ||
    n.includes("letter") ||
    n.includes("welcome") ||
    n.includes("pray")
  )
    return "text";
  if (n.includes("fidget")) return "sync";
  return categoryIcon(category);
}
const ownerNav: {
  id: Screen;
  label: string;
  icon: Icon;
  color: string;
  soft: string;
}[] = [
  {
    id: "sale",
    label: "Sell",
    icon: "cart-outline",
    color: C.green,
    soft: C.soft,
  },
  {
    id: "dashboard",
    label: "Today",
    icon: "today-outline",
    color: C.accent,
    soft: C.accentSoft,
  },
  {
    id: "inventory",
    label: "Stock",
    icon: "cube-outline",
    color: C.teal,
    soft: C.tealSoft,
  },
  {
    id: "more",
    label: "More",
    icon: "grid-outline",
    color: C.purple,
    soft: C.purpleSoft,
  },
];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session ? <SignedIn session={session} /> : <Login />;
}

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const signIn = async () => {
    const clean = username.trim().toLowerCase();
    if (!clean || !password) {
      setError("Please enter your username and password.");
      return;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(clean)) {
      setError("Please check the username and try again.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: e } = await supabase.auth.signInWithPassword({
      email: `${clean}@login.mik.app`,
      password,
    });
    setBusy(false);
    if (e)
      setError("The username or password is not correct. Please try again.");
  };
  return (
    <SafeAreaView style={s.login}>
      <StatusBar style="dark" />
      <View style={s.loginCard}>
        <Image
          source={require("../assets/mik-logo.png")}
          style={s.brandLogo}
          resizeMode="contain"
        />
        <Text style={s.loginTitle}>Hello!</Text>
        <Text style={s.centerHelp}>Let’s get your shop ready.</Text>
        <Label>Username</Label>
        <TextInput
          style={s.input}
          value={username}
          onChangeText={setUsername}
          placeholder="Your username"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Label>Password</Label>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          onSubmitEditing={signIn}
        />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <BigButton
          label={busy ? "Opening your shop…" : "Let’s go"}
          icon="arrow-forward-circle-outline"
          onPress={signIn}
          disabled={busy}
        />
        <Pressable style={s.guidePreview} onPress={() => setGuideOpen(true)}>
          <Ionicons name="help-circle-outline" size={21} color={C.green} />
          <Text style={s.guidePreviewText}>See how Mik works</Text>
        </Pressable>
      </View>
      <GuideModal visible={guideOpen} onClose={() => setGuideOpen(false)} />
    </SafeAreaView>
  );
}

function SignedIn({ session }: { session: Session }) {
  const [checking, setChecking] = useState(true);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  useEffect(() => {
    supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setPlatformAdmin(Boolean(data));
        setChecking(false);
      });
  }, [session.user.id]);
  if (checking)
    return (
      <SafeAreaView style={s.loading}>
        <ActivityIndicator size="large" color={C.green} />
        <Text style={s.help}>Opening your account…</Text>
      </SafeAreaView>
    );
  return platformAdmin ? <PlatformAdmin /> : <ShopApp session={session} />;
}

type AdminShop = {
  id: string;
  name: string;
  slug: string | null;
  login_username: string | null;
  status: string;
  created_at: string;
};
function PlatformAdmin() {
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("123456");
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,slug,login_username,status,created_at")
      .eq("status", "active")
      .order("created_at");
    if (error) Alert.alert("Shops not loaded", error.message);
    setShops((data ?? []) as AdminShop[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const create = async () => {
    const clean = username.trim().toLowerCase();
    if (!name.trim()) return Alert.alert("Enter a shop name");
    if (!/^[a-z0-9._-]{3,30}$/.test(clean))
      return Alert.alert(
        "Check the username",
        "Use 3–30 letters, numbers, dots, dashes or underscores.",
      );
    if (password.length < 6)
      return Alert.alert("Password is too short", "Use at least 6 characters.");
    setCreating(true);
    const { error } = await supabase.functions.invoke("admin-create-shop", {
      body: { shopName: name.trim(), username: clean, password },
    });
    setCreating(false);
    if (error) return Alert.alert("Profile not created", error.message);
    setName("");
    setUsername("");
    setPassword("123456");
    setShowForm(false);
    await load();
    Alert.alert(
      "Shop profile created",
      `${clean} can now log in to this shop.`,
    );
  };
  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="dark" />
      <View style={s.adminTop}>
        <View>
          <Text style={s.kicker}>OWNER</Text>
          <Text style={s.shopName}>Shop profiles</Text>
        </View>
        <Pressable
          style={s.adminSignout}
          onPress={() => supabase.auth.signOut()}
        >
          <Ionicons name="log-out-outline" size={22} color={C.red} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.adminPage}>
        <View style={s.adminHero}>
          <Text style={s.heroLabel}>ACTIVE SHOP PROFILES</Text>
          <Text style={s.heroValue}>{shops.length}</Text>
        </View>
        {showForm ? (
          <View style={s.editCard}>
            <Text style={s.editName}>Create a shop profile</Text>
            <Label>Shop name</Label>
            <TextInput
              style={s.input}
              placeholder="Example: Ana's Mini Mart"
              value={name}
              onChangeText={setName}
            />
            <Label>Username</Label>
            <TextInput
              style={s.input}
              placeholder="Example: anashop"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Label>Starting password</Label>
            <TextInput
              style={s.input}
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <BigButton
              label={creating ? "Creating profile…" : "Create shop profile"}
              icon="person-add-outline"
              onPress={create}
              disabled={creating}
            />
            <Pressable style={s.cancel} onPress={() => setShowForm(false)}>
              <Text style={s.help}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <BigButton
            label="Create another shop profile"
            icon="add-circle-outline"
            onPress={() => setShowForm(true)}
          />
        )}
        <Text style={s.section}>Active shops</Text>
        {loading ? (
          <ActivityIndicator color={C.green} />
        ) : (
          shops.map((shop) => (
            <View key={shop.id} style={s.adminShop}>
              <View style={s.shopAvatar}>
                <Ionicons name="storefront" size={24} color={C.green} />
              </View>
              <View style={s.flex}>
                <Text style={s.rowTitle}>{shop.name}</Text>
                <Text style={s.rowHelp}>
                  <Ionicons
                    name="person-circle-outline"
                    size={14}
                    color={C.muted}
                  />{" "}
                  {shop.login_username ?? "No username connected"}
                </Text>
              </View>
              <View style={s.statusPill}>
                <Text style={s.statusText}>ACTIVE</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ShopApp({ session }: { session: Session }) {
  const [screen, setScreen] = useState<Screen>("sale");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const loadData = useCallback(
    async (businessId: string, selectedLocationId: string) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const [{ data: pd }, { data: cd }, { data: sd }] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,business_id,name,regular_price,sale_price,image_url,variant_label,low_stock_threshold,category_id,active,inventory_levels(quantity_on_hand,needs_stock_count,location_id),product_variants(id,name,price_override,active,variant_inventory_levels(quantity_on_hand,location_id))",
          )
          .eq("business_id", businessId)
          .eq("active", true)
          .eq("inventory_levels.location_id", selectedLocationId)
          .eq("product_variants.active", true)
          .eq(
            "product_variants.variant_inventory_levels.location_id",
            selectedLocationId,
          )
          .order("name"),
        supabase
          .from("categories")
          .select("id,name")
          .eq("business_id", businessId)
          .eq("active", true)
          .order("sort_order"),
        supabase
          .from("sales")
          .select(
            "id,receipt_number,payment_method,total,status,created_at,payment_confirmed_at,payment_reference,sale_items(product_name,variant_name,quantity)",
          )
          .eq("location_id", selectedLocationId)
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
      ]);
      setProducts(
        (pd ?? []).map((p: any) => {
          const variants = (p.product_variants ?? []).map((v: any) => ({
            ...v,
            quantity_on_hand:
              v.variant_inventory_levels?.[0]?.quantity_on_hand ?? 0,
          })) as ProductVariant[];
          return {
            ...p,
            variants,
            quantity_on_hand: variants.length
              ? variants.reduce((sum, v) => sum + v.quantity_on_hand, 0)
              : (p.inventory_levels?.[0]?.quantity_on_hand ?? 0),
            needs_stock_count: variants.length
              ? false
              : (p.inventory_levels?.[0]?.needs_stock_count ?? true),
          };
        }) as Product[],
      );
      setCategories((cd ?? []) as Category[]);
      setSales((sd ?? []) as Sale[]);
    },
    [],
  );
  const initialize = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,display_name")
        .eq("id", session.user.id)
        .maybeSingle(),
      supabase
        .from("business_memberships")
        .select("business_id,role,businesses(id,name)")
        .eq("user_id", session.user.id),
    ]);
    setProfile(p as Profile | null);
    const member: any = m?.[0];
    if (!member) {
      setNeedsSetup(true);
      setLoading(false);
      return;
    }
    const b = {
      id: member.business_id,
      name: member.businesses.name,
      role: member.role,
    } as Business;
    setBusiness(b);
    const { data: ld } = await supabase
      .from("locations")
      .select("id,business_id,name")
      .eq("business_id", b.id)
      .eq("active", true)
      .order("name");
    const list = (ld ?? []) as Location[];
    const first = list[0]?.id ?? "";
    setLocations(list);
    setLocationId(first);
    if (first) await loadData(b.id, first);
    setNeedsSetup(false);
    setLoading(false);
  }, [loadData, session.user.id]);
  useEffect(() => {
    initialize();
  }, [initialize]);
  useEffect(() => {
    if (loading || needsSetup || !business) return;
    const key = `mik-guide-v1-${session.user.id}`;
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (seen !== "done") setGuideOpen(true);
      })
      .catch(() => setGuideOpen(true));
  }, [business, loading, needsSetup, session.user.id]);
  const closeGuide = async () => {
    setGuideOpen(false);
    await AsyncStorage.setItem(`mik-guide-v1-${session.user.id}`, "done").catch(
      () => undefined,
    );
  };
  if (loading)
    return (
      <SafeAreaView style={s.loading}>
        <ActivityIndicator size="large" color={C.green} />
        <Text style={s.help}>Opening your shop…</Text>
      </SafeAreaView>
    );
  if (needsSetup) return <NoShopProfile />;
  const role: Role = business?.role ?? "staff";
  const nav =
    role === "owner" ? ownerNav : ownerNav.filter((x) => x.id !== "more");
  const current = locations.find((x) => x.id === locationId);
  const reload = () =>
    business && locationId
      ? loadData(business.id, locationId)
      : Promise.resolve();
  const chooseLocation = async (id: string) => {
    setLocationId(id);
    setScreen("sale");
    if (business) await loadData(business.id, id);
  };
  let body: ReactNode;
  if (screen === "sale")
    body = (
      <SaleScreen
        key={locationId}
        products={products}
        categories={categories}
        locationId={locationId}
        onSaved={reload}
      />
    );
  else if (screen === "dashboard")
    body = (
      <Dashboard
        products={products}
        sales={sales}
        onSell={() => setScreen("sale")}
      />
    );
  else if (screen === "inventory")
    body = (
      <Inventory
        products={products}
        categories={categories}
        locationId={locationId}
        onSaved={reload}
      />
    );
  else if (screen === "products")
    body = (
      <Products
        businessId={business!.id}
        locationId={locationId}
        products={products}
        categories={categories}
        onSaved={reload}
        onBack={() => setScreen("more")}
      />
    );
  else if (screen === "reports")
    body = (
      <View style={s.flex}>
        <Back title="Sales reports" onPress={() => setScreen("more")} />
        <ReportsScreen locationId={locationId} hideTitle />
      </View>
    );
  else
    body = (
      <More
        profile={profile}
        onOpen={setScreen}
        onGuide={() => setGuideOpen(true)}
      />
    );
  const selected =
    screen === "products" || screen === "reports" ? "more" : screen;
  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="dark" />
      <View style={s.top}>
        <Image
          source={require("../assets/mik-app-icon.png")}
          style={s.shopLogo}
        />
        <View style={s.flex}>
          <Text style={s.shopName} numberOfLines={1}>
            {business?.name}
          </Text>
          <Text style={s.locationName}>{current?.name ?? "Shop location"}</Text>
        </View>
        <View style={s.ready}>
          <View style={s.dot} />
          <Text style={s.readyText}>Ready</Text>
        </View>
      </View>
      {locations.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.locationBar}
        >
          <Text style={s.locationLabel}>Shop:</Text>
          {locations.map((l) => (
            <Chip
              key={l.id}
              label={l.name}
              selected={locationId === l.id}
              onPress={() => chooseLocation(l.id)}
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={s.content}>{body}</View>
      <View style={s.nav}>
        {nav.map((item) => (
          <Pressable
            key={item.id}
            style={s.navItem}
            onPress={() => {
              setScreen(item.id);
              if (item.id === "dashboard") void reload();
            }}
          >
            <View
              style={[
                s.navIcon,
                {
                  backgroundColor:
                    selected === item.id ? item.color : item.soft,
                },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={24}
                color={selected === item.id ? C.white : item.color}
              />
            </View>
            <Text
              style={[
                s.navText,
                selected === item.id && s.navTextOn,
                { color: selected === item.id ? item.color : C.muted },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <GuideModal visible={guideOpen} onClose={closeGuide} />
    </SafeAreaView>
  );
}

function NoShopProfile() {
  return (
    <SafeAreaView style={s.login}>
      <View style={s.loginCard}>
        <View style={s.logo}>
          <Ionicons name="storefront" size={34} color={C.white} />
        </View>
        <Text style={s.loginTitle}>Your shop is not ready yet</Text>
        <Text style={s.centerHelp}>
          Ask the app administrator to create or connect your shop profile.
        </Text>
        <BigButton
          label="Sign out"
          icon="log-out-outline"
          onPress={() => supabase.auth.signOut()}
        />
      </View>
    </SafeAreaView>
  );
}

function SaleScreen({
  products,
  categories,
  locationId,
  onSaved,
}: {
  products: Product[];
  categories: Category[];
  locationId: string;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [choosing, setChoosing] = useState<Product | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [gcashReceived, setGcashReceived] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Other";
  const filtered = products.filter(
    (p) =>
      (!category || p.category_id === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const total = cart.reduce((n, x) => n + x.quantity * x.unitPrice, 0);
  const count = cart.reduce((n, x) => n + x.quantity, 0);
  const cartKey = (productId: string, variantId?: string | null) =>
    `${productId}:${variantId ?? "main"}`;
  const add = (p: Product, variant: ProductVariant | null = null) => {
    if (p.variants.length && !variant) {
      setChoosing(p);
      return;
    }
    const price = variant?.price_override ?? p.sale_price ?? p.regular_price;
    const available = variant?.quantity_on_hand ?? p.quantity_on_hand;
    if (price === null)
      return Alert.alert("No price yet", "Ask the owner to add a price first.");
    if (available < 1)
      return Alert.alert(
        "Out of stock",
        "There are no items available to sell.",
      );
    const key = cartKey(p.id, variant?.id);
    setCart((old) => {
      const found = old.find(
        (x) => cartKey(x.product.id, x.variant?.id) === key,
      );
      if (found)
        return found.quantity >= available
          ? old
          : old.map((x) =>
              cartKey(x.product.id, x.variant?.id) === key
                ? { ...x, quantity: x.quantity + 1 }
                : x,
            );
      return [...old, { product: p, variant, quantity: 1, unitPrice: price }];
    });
    setChoosing(null);
  };
  const change = (key: string, n: number) =>
    setCart((old) =>
      old.flatMap((x) =>
        cartKey(x.product.id, x.variant?.id) !== key
          ? [x]
          : x.quantity + n <= 0
            ? []
            : [
                {
                  ...x,
                  quantity: Math.min(
                    x.variant?.quantity_on_hand ?? x.product.quantity_on_hand,
                    x.quantity + n,
                  ),
                },
              ],
      ),
    );
  const complete = async () => {
    if (!cart.length) return;
    if (payment === "gcash" && !gcashReceived)
      return Alert.alert(
        "Check GCash first",
        "Confirm that the payment appeared in the shop’s GCash account.",
      );
    setSaving(true);
    const { data, error } = await supabase.rpc(
      "create_confirmed_sale_with_choices",
      {
        p_location_id: locationId,
        p_items: cart.map((x) => ({
          product_id: x.product.id,
          variant_id: x.variant?.id ?? null,
          quantity: x.quantity,
        })),
        p_payment_method: payment,
        p_payment_received: payment === "cash" || gcashReceived,
        p_payment_reference:
          payment === "gcash" ? paymentReference.trim() : null,
      },
    );
    if (error) {
      setSaving(false);
      return Alert.alert(
        "Sale not saved",
        "Please check the stock and try again.",
      );
    }
    const { data: saved } = await supabase
      .from("sales")
      .select("receipt_number,total")
      .eq("id", data)
      .single();
    setSaving(false);
    setCart([]);
    setReview(false);
    setPayment("cash");
    setGcashReceived(false);
    setPaymentReference("");
    await onSaved();
    Alert.alert(
      "Sale completed",
      `Receipt ${saved?.receipt_number ?? ""}\n${peso(Number(saved?.total ?? total))} paid by ${payment === "cash" ? "Cash" : "GCash — received"}.`,
    );
  };
  if (review)
    return (
      <View style={s.flex}>
        <Back title="Review sale" onPress={() => setReview(false)} />
        <ScrollView contentContainerStyle={s.scroll}>
          <Step number="2">Check quantity, then choose payment.</Step>
          {cart.map((x) => {
            const key = cartKey(x.product.id, x.variant?.id);
            return (
              <View key={key} style={s.cartRow}>
                {x.product.image_url ? (
                  <Image
                    source={{ uri: x.product.image_url }}
                    style={s.miniProductImage}
                  />
                ) : (
                  <View style={s.miniMissingPhoto}>
                    <Text style={s.miniMissingText}>NO PHOTO</Text>
                  </View>
                )}
                <View style={s.flex}>
                  <Text style={s.rowTitle}>{x.product.name}</Text>
                  {x.variant ? (
                    <Text style={s.variantChosen}>
                      {x.product.variant_label ?? "Choice"}: {x.variant.name}
                    </Text>
                  ) : null}
                  <Text style={s.rowHelp}>{peso(x.unitPrice)} each</Text>
                </View>
                <Quantity
                  value={x.quantity}
                  minus={() => change(key, -1)}
                  plus={() => change(key, 1)}
                />
                <Text style={s.lineTotal}>
                  {peso(x.quantity * x.unitPrice)}
                </Text>
              </View>
            );
          })}
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>Amount to collect</Text>
            <Text style={s.totalValue}>{peso(total)}</Text>
          </View>
          <Text style={s.section}>How did the customer pay?</Text>
          <View style={s.choiceRow}>
            <Choice
              label="Cash"
              icon="cash-outline"
              selected={payment === "cash"}
              onPress={() => {
                setPayment("cash");
                setGcashReceived(false);
                setPaymentReference("");
              }}
            />
            <Choice
              label="GCash"
              icon="phone-portrait-outline"
              selected={payment === "gcash"}
              onPress={() => setPayment("gcash")}
            />
          </View>
          {payment === "gcash" ? (
            <View style={s.gcashCheck}>
              <View style={s.gcashHeading}>
                <View style={s.gcashIcon}>
                  <Ionicons
                    name="phone-portrait-outline"
                    size={27}
                    color={C.green}
                  />
                </View>
                <View style={s.flex}>
                  <Text style={s.rowTitle}>Check the shop’s GCash</Text>
                  <Text style={s.rowHelp}>
                    Only confirm after the payment appears.
                  </Text>
                </View>
              </View>
              <Pressable
                style={[s.receivedButton, gcashReceived && s.receivedButtonOn]}
                onPress={() => setGcashReceived((value) => !value)}
              >
                <Ionicons
                  name={gcashReceived ? "checkmark-circle" : "ellipse-outline"}
                  size={26}
                  color={gcashReceived ? C.white : C.green}
                />
                <Text
                  style={[s.receivedText, gcashReceived && s.receivedTextOn]}
                >
                  {gcashReceived
                    ? "Payment received"
                    : "I confirm payment was received"}
                </Text>
              </Pressable>
              <Label>GCash reference (optional)</Label>
              <TextInput
                style={s.input}
                value={paymentReference}
                onChangeText={setPaymentReference}
                placeholder="Example: last 6 digits"
                keyboardType="number-pad"
              />
            </View>
          ) : null}
          <BigButton
            label={
              saving
                ? "Saving sale…"
                : payment === "gcash" && !gcashReceived
                  ? "Confirm GCash payment above"
                  : `Complete sale · ${peso(total)}`
            }
            icon="checkmark-circle-outline"
            onPress={complete}
            disabled={
              saving || !cart.length || (payment === "gcash" && !gcashReceived)
            }
          />
          <Text style={s.safe}>
            Stock changes only after you complete the sale.
          </Text>
        </ScrollView>
      </View>
    );
  return (
    <View style={s.flex}>
      <FlatList
        data={filtered}
        numColumns={2}
        keyExtractor={(p) => p.id}
        columnWrapperStyle={s.productRow}
        contentContainerStyle={[
          s.productList,
          count > 0 && s.productListBasket,
        ]}
        ListHeaderComponent={
          <>
            <Text style={s.pageTitle}>What are we selling?</Text>
            <Step number="1">Tap a product photo to add it.</Step>
            <Search value={search} onChange={setSearch} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips}
            >
              <Chip
                label="All products"
                icon="apps"
                selected={!category}
                onPress={() => setCategory(null)}
              />
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  icon={categoryIcon(c.name)}
                  selected={category === c.id}
                  onPress={() => setCategory(c.id)}
                />
              ))}
            </ScrollView>
          </>
        }
        ListEmptyComponent={<Empty title="Nothing here yet" />}
        renderItem={({ item }) => {
          const price = item.sale_price ?? item.regular_price;
          const qty = cart
            .filter((x) => x.product.id === item.id)
            .reduce((sum, x) => sum + x.quantity, 0);
          const unavailable = item.quantity_on_hand <= 0 || price === null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.name}, ${price === null ? "no price" : peso(price)}`}
              style={[
                s.productCard,
                unavailable && s.disabled,
                qty > 0 && s.productOn,
              ]}
              onPress={() => add(item)}
            >
              <View style={s.productVisual}>
                {item.image_url ? (
                  <Image
                    source={{ uri: item.image_url }}
                    style={s.productCardImage}
                  />
                ) : (
                  <View style={s.missingPhoto}>
                    <Text style={s.missingPhotoText}>PHOTO NEEDED</Text>
                  </View>
                )}
                {qty > 0 ? (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{qty}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.productName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={s.productPrice}>
                {price === null ? "No price" : peso(price)}
              </Text>
              {item.variants.length ? (
                <Text style={s.variantHint}>
                  Choose {item.variant_label ?? "option"}
                </Text>
              ) : null}
              {item.sale_price !== null && item.regular_price !== null ? (
                <Text style={s.saleLine}>
                  SALE{" "}
                  <Text style={s.oldPrice}>{peso(item.regular_price)}</Text>
                </Text>
              ) : null}
              <Text
                style={[
                  s.stock,
                  item.quantity_on_hand <= item.low_stock_threshold && s.low,
                ]}
              >
                {item.needs_stock_count
                  ? "Stock count needed"
                  : item.quantity_on_hand <= 0
                    ? "Out of stock"
                    : `${item.quantity_on_hand} in stock`}
              </Text>
            </Pressable>
          );
        }}
      />
      <Modal
        visible={Boolean(choosing)}
        transparent
        animationType="fade"
        onRequestClose={() => setChoosing(null)}
      >
        <SafeAreaView style={s.variantOverlay}>
          <View style={s.variantCard}>
            <View style={s.variantHeader}>
              <View style={s.flex}>
                <Text style={s.variantKicker}>
                  CHOOSE {choosing?.variant_label?.toUpperCase() ?? "OPTION"}
                </Text>
                <Text style={s.variantTitle}>{choosing?.name}</Text>
              </View>
              <Pressable
                accessibilityLabel="Close choices"
                style={s.guideClose}
                onPress={() => setChoosing(null)}
              >
                <Ionicons name="close" size={24} color={C.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.variantGrid}>
              {choosing?.variants.map((variant) => {
                const unavailable = variant.quantity_on_hand <= 0;
                return (
                  <Pressable
                    key={variant.id}
                    style={[s.variantButton, unavailable && s.disabled]}
                    disabled={unavailable}
                    onPress={() => add(choosing, variant)}
                  >
                    <Text style={s.variantButtonText}>{variant.name}</Text>
                    <Text style={[s.variantStock, unavailable && s.low]}>
                      {unavailable ? "Out" : `${variant.quantity_on_hand} left`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
      {count > 0 ? (
        <View style={s.basket}>
          <View>
            <Text style={s.basketCount}>
              {count} item{count === 1 ? "" : "s"} selected
            </Text>
            <Text style={s.basketTotal}>{peso(total)}</Text>
          </View>
          <Pressable style={s.reviewButton} onPress={() => setReview(true)}>
            <Ionicons name="receipt-outline" size={22} color={C.white} />
            <Text style={s.reviewText}>Review & pay</Text>
            <Ionicons name="arrow-forward" size={22} color={C.white} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Dashboard({
  products,
  sales,
  onSell,
}: {
  products: Product[];
  sales: Sale[];
  onSell: () => void;
}) {
  const day = sales.filter((x) => x.status === "completed");
  const total = day.reduce((n, x) => n + Number(x.total), 0);
  const cash = day
    .filter((x) => x.payment_method === "cash")
    .reduce((n, x) => n + Number(x.total), 0);
  const low = products.filter(
    (x) => x.quantity_on_hand <= x.low_stock_threshold,
  );
  const map = new Map<string, number>();
  day
    .flatMap((x) => x.sale_items ?? [])
    .forEach((item) => {
      const name = item.variant_name
        ? `${item.product_name} · ${item.variant_name}`
        : item.product_name;
      map.set(name, (map.get(name) ?? 0) + Number(item.quantity));
    });
  const sold = [...map]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.pageTitle}>Today</Text>
      <Text style={s.subtitle}>{shortDate(new Date().toISOString())}</Text>
      <View style={s.hero}>
        <Text style={s.heroLabel}>Sales today</Text>
        <Text style={s.heroValue}>{peso(total)}</Text>
        <Text style={s.heroSmall}>
          {day.length} completed sale{day.length === 1 ? "" : "s"}
        </Text>
      </View>
      <View style={s.stats}>
        <Stat
          label="Cash"
          value={peso(cash)}
          icon="cash-outline"
          color={C.accent}
        />
        <Stat
          label="GCash"
          value={peso(total - cash)}
          icon="phone-portrait-outline"
          color={C.green}
        />
      </View>
      <BigButton
        label="Start a new sale"
        onPress={onSell}
        icon="cart-outline"
      />
      <Text style={s.section}>Products sold today</Text>
      {sold.length ? (
        sold.map((item) => (
          <View key={item.name} style={s.soldRow}>
            <View style={s.soldIcon}>
              <Ionicons
                name={productIcon(item.name)}
                size={24}
                color={C.accent}
              />
            </View>
            <Text style={s.soldName}>{item.name}</Text>
            <View style={s.soldQty}>
              <Text style={s.soldQtyText}>{item.quantity}</Text>
            </View>
          </View>
        ))
      ) : (
        <Empty title="No products sold yet" />
      )}
      <Text style={s.section}>Today’s sales</Text>
      {day.length ? (
        day.map((sale) => (
          <View key={sale.id} style={s.receipt}>
            <View style={s.receiptTop}>
              <View>
                <Text style={s.rowTitle}>Sale {sale.receipt_number}</Text>
                <Text style={s.rowHelp}>
                  {new Date(sale.created_at).toLocaleTimeString("en-PH", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <View style={s.receiptRight}>
                <Text style={s.rowPrice}>{peso(Number(sale.total))}</Text>
                <Text style={s.paymentText}>
                  {sale.payment_method === "cash" ? "CASH" : "GCASH"}
                </Text>
              </View>
            </View>
            <View style={s.receiptItems}>
              {(sale.sale_items ?? []).map((item, index) => (
                <Text
                  key={`${item.product_name}-${index}`}
                  style={s.receiptProduct}
                >
                  {item.quantity} × {item.product_name}
                  {item.variant_name ? ` · ${item.variant_name}` : ""}
                </Text>
              ))}
            </View>
          </View>
        ))
      ) : (
        <Empty title="No sales yet today" />
      )}
      <Text style={s.section}>Stock that needs attention</Text>
      {low.length ? (
        low.slice(0, 8).map((p) => (
          <View key={p.id} style={s.attention}>
            <View style={s.alertIcon}>
              <Ionicons name="alert" size={20} color={C.orange} />
            </View>
            <View>
              <Text style={s.rowTitle}>{p.name}</Text>
              <Text style={s.rowHelp}>
                {p.needs_stock_count
                  ? "Stock count needed"
                  : `${p.quantity_on_hand} left — add stock soon`}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Empty title="Stock looks good" />
      )}
    </ScrollView>
  );
}

function Products({
  businessId,
  locationId,
  products,
  categories,
  onSaved,
  onBack,
}: {
  businessId: string;
  locationId: string;
  products: Product[];
  categories: Category[];
  onSaved: () => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [regular, setRegular] = useState("");
  const [sale, setSale] = useState("");
  const [startingStock, setStartingStock] = useState("0");
  const [hasChoices, setHasChoices] = useState(false);
  const [choiceLabel, setChoiceLabel] = useState("Letter");
  const [choiceText, setChoiceText] = useState("");
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState("image/jpeg");
  const [saving, setSaving] = useState(false);
  const category = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Other";
  const reset = () => {
    setSelected(null);
    setCreating(false);
    setName("");
    setCategoryId(null);
    setRegular("");
    setSale("");
    setStartingStock("0");
    setHasChoices(false);
    setChoiceLabel("Letter");
    setChoiceText("");
    setPickedUri(null);
    setPickedMime("image/jpeg");
  };
  const open = (p: Product) => {
    setSelected(p);
    setCreating(false);
    setName(p.name);
    setCategoryId(p.category_id);
    setRegular(p.regular_price?.toString() ?? "");
    setSale(p.sale_price?.toString() ?? "");
    setHasChoices(p.variants.length > 0);
    setChoiceLabel(p.variant_label ?? "Choice");
    setChoiceText(p.variants.map((v) => v.name).join(", "));
    setPickedUri(null);
  };
  const startCreate = () => {
    reset();
    setCreating(true);
    setCategoryId(categories[0]?.id ?? null);
  };
  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return Alert.alert(
        "Photo access needed",
        "Allow Mik to choose a product photo from this device.",
      );
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.72,
    });
    if (!result.canceled) {
      setPickedUri(result.assets[0].uri);
      setPickedMime(result.assets[0].mimeType ?? "image/jpeg");
    }
  };
  const uploadImage = async (productId: string, uri: string) => {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Photo could not be read");
    const bytes = await response.arrayBuffer();
    const path = `${businessId}/${productId}/main`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, bytes, { contentType: pickedMime, upsert: true });
    if (error) throw error;
    return `${supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  };
  const numbers = () => {
    const r = regular.trim() === "" ? null : Number(regular);
    const sp = sale.trim() === "" ? null : Number(sale);
    if (
      (r !== null && (!Number.isFinite(r) || r < 0)) ||
      (sp !== null && (!Number.isFinite(sp) || sp < 0))
    )
      return null;
    return { r, sp };
  };
  const choiceNames = () => [
    ...new Set(
      choiceText
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const useAlphabet = () => {
    setHasChoices(true);
    setChoiceLabel("Letter");
    setChoiceText(
      Array.from({ length: 26 }, (_, index) =>
        String.fromCharCode(65 + index),
      ).join(", "),
    );
  };
  const save = async () => {
    const cleanName = name.trim();
    const prices = numbers();
    if (!cleanName) return Alert.alert("Enter a product name");
    if (!prices)
      return Alert.alert(
        "Check the price",
        "Enter a valid price or leave the sale price empty.",
      );
    if (creating && !pickedUri)
      return Alert.alert(
        "Add a product photo",
        "Choose a clear photo so the cashier can recognise this item.",
      );
    setSaving(true);
    if (creating) {
      const stock = Number(startingStock);
      if (!Number.isInteger(stock) || stock < 0) {
        setSaving(false);
        return Alert.alert(
          "Check starting stock",
          "Enter a whole number of zero or more.",
        );
      }
      const variants = hasChoices ? choiceNames() : [];
      if (hasChoices && !choiceLabel.trim()) {
        setSaving(false);
        return Alert.alert(
          "Name the choice",
          "Example: Letter, Colour, or Size.",
        );
      }
      if (hasChoices && variants.length < 2) {
        setSaving(false);
        return Alert.alert(
          "Add choices",
          "Enter at least two choices, such as A, B, C.",
        );
      }
      const { data: createdId, error } = await supabase.rpc(
        "create_product_with_choices",
        {
          p_business_id: businessId,
          p_location_id: locationId,
          p_name: cleanName,
          p_category_id: categoryId,
          p_regular_price: prices.r,
          p_sale_price: prices.sp,
          p_starting_stock: stock,
          p_variant_label: hasChoices ? choiceLabel.trim() : null,
          p_variants: variants.map((variantName) => ({ name: variantName })),
        },
      );
      if (error || !createdId) {
        setSaving(false);
        return Alert.alert(
          "Product not created",
          error?.message ?? "Please try again.",
        );
      }
      if (pickedUri) {
        try {
          const image_url = await uploadImage(String(createdId), pickedUri);
          const { error: imageLinkError } = await supabase
            .from("products")
            .update({ image_url })
            .eq("id", createdId);
          if (imageLinkError) throw imageLinkError;
        } catch {
          setSaving(false);
          await onSaved();
          reset();
          return Alert.alert(
            "Product created",
            "The item and stock were saved without the photo. Open it and try adding the photo again.",
          );
        }
      }
      setSaving(false);
      await onSaved();
      reset();
      return Alert.alert("Product created", `${cleanName} is ready to sell.`);
    }
    if (!selected) {
      setSaving(false);
      return;
    }
    let image_url = selected.image_url;
    try {
      if (pickedUri) image_url = await uploadImage(selected.id, pickedUri);
    } catch {
      setSaving(false);
      return Alert.alert("Photo not saved", "Please choose the photo again.");
    }
    const { error } = await supabase
      .from("products")
      .update({
        name: cleanName,
        category_id: categoryId,
        regular_price: prices.r,
        sale_price: prices.sp,
        image_url,
      })
      .eq("id", selected.id);
    setSaving(false);
    if (error) return Alert.alert("Product not saved", error.message);
    await onSaved();
    reset();
    Alert.alert(
      "Product updated",
      "The new details will be used for the next sale.",
    );
  };
  if (selected || creating) {
    const image = pickedUri ?? selected?.image_url ?? null;
    return (
      <ScrollView contentContainerStyle={s.scroll}>
        <Back
          title={creating ? "New product" : "Edit product"}
          onPress={reset}
        />
        <View style={s.editCard}>
          <View style={s.productPhoto}>
            {image ? (
              <Image source={{ uri: image }} style={s.productPhotoImage} />
            ) : (
              <View style={s.missingPhoto}>
                <Text style={s.missingPhotoText}>PRODUCT PHOTO NEEDED</Text>
              </View>
            )}
          </View>
          <BigButton
            label={image ? "Change product photo" : "Choose product photo"}
            icon="camera-outline"
            onPress={chooseImage}
          />
          <Label>Product name</Label>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Example: Blue keychain"
          />
          <Label>Category</Label>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
          >
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                icon={categoryIcon(c.name)}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>
          <Label>Normal price</Label>
          <TextInput
            style={s.priceInput}
            keyboardType="decimal-pad"
            value={regular}
            onChangeText={setRegular}
            placeholder="0.00"
          />
          <Label>Sale price (optional)</Label>
          <TextInput
            style={s.priceInput}
            keyboardType="decimal-pad"
            value={sale}
            onChangeText={setSale}
            placeholder="Leave empty when not on sale"
          />
          {creating ? (
            <View style={s.choiceSetup}>
              <View style={s.choiceSetupTop}>
                <View style={s.flex}>
                  <Text style={s.rowTitle}>Does it have choices?</Text>
                  <Text style={s.rowHelp}>
                    Example: letters A–Z, colours, or sizes
                  </Text>
                </View>
                <Pressable
                  style={[s.choiceToggle, hasChoices && s.choiceToggleOn]}
                  onPress={() => setHasChoices((value) => !value)}
                >
                  <Text
                    style={[
                      s.choiceToggleText,
                      hasChoices && s.choiceToggleTextOn,
                    ]}
                  >
                    {hasChoices ? "YES" : "NO"}
                  </Text>
                </Pressable>
              </View>
              {hasChoices ? (
                <>
                  <Label>Choice name</Label>
                  <TextInput
                    style={s.input}
                    value={choiceLabel}
                    onChangeText={setChoiceLabel}
                    placeholder="Example: Letter"
                  />
                  <Pressable style={s.alphabetButton} onPress={useAlphabet}>
                    <Ionicons name="text-outline" size={22} color={C.green} />
                    <Text style={s.alphabetText}>Use letters A to Z</Text>
                  </Pressable>
                  <Label>Choices</Label>
                  <TextInput
                    style={[s.input, s.choiceInput]}
                    value={choiceText}
                    onChangeText={setChoiceText}
                    placeholder="A, B, C"
                    multiline
                  />
                  <Text style={s.rowHelp}>
                    Separate each choice with a comma.
                  </Text>
                </>
              ) : null}
            </View>
          ) : hasChoices ? (
            <View style={s.choiceSetup}>
              <Text style={s.rowTitle}>{choiceLabel} choices</Text>
              <View style={s.choicePills}>
                {selected?.variants.map((variant) => (
                  <View key={variant.id} style={s.choicePill}>
                    <Text style={s.choicePillText}>{variant.name}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.rowHelp}>
                Stock for each choice is changed from the Stock screen.
              </Text>
            </View>
          ) : null}
          {creating ? (
            <>
              <Label>
                {hasChoices
                  ? "Starting stock for each choice"
                  : "Starting stock at this shop"}
              </Label>
              <TextInput
                style={s.qtyInput}
                keyboardType="number-pad"
                value={startingStock}
                onChangeText={setStartingStock}
                placeholder="0"
              />
            </>
          ) : null}
          <View style={s.note}>
            <Ionicons name="information-circle" size={22} color={C.green} />
            <Text style={s.noteText}>
              {creating
                ? "A photo is required so the cashier can match the real item. "
                : "A sale price is charged automatically when entered."}
            </Text>
          </View>
          <BigButton
            label={
              saving
                ? creating
                  ? "Creating product…"
                  : "Saving product…"
                : creating
                  ? "Create product"
                  : "Save changes"
            }
            icon={creating ? "add-circle-outline" : "save-outline"}
            onPress={save}
            disabled={saving}
          />
        </View>
      </ScrollView>
    );
  }
  return (
    <View style={s.flex}>
      <Back title="Products" onPress={onBack} />
      <BigButton
        label="Create a new product"
        icon="add-circle-outline"
        onPress={startCreate}
      />
      <Search value={search} onChange={setSearch} />
      <FlatList
        data={products.filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase()),
        )}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <Pressable style={s.listRow} onPress={() => open(item)}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={s.listImage} />
            ) : (
              <View style={s.listMissingPhoto}>
                <Text style={s.listMissingText}>PHOTO{`\n`}NEEDED</Text>
              </View>
            )}
            <View style={s.flex}>
              <Text style={s.rowTitle}>{item.name}</Text>
              <Text style={s.rowHelp}>
                {category(item.category_id)} · {item.quantity_on_hand} in stock
                {item.variants.length
                  ? ` across ${item.variants.length} ${item.variant_label?.toLowerCase() ?? "choice"} choices`
                  : ""}
              </Text>
            </View>
            <Text style={s.rowPrice}>
              {item.sale_price !== null
                ? peso(item.sale_price)
                : item.regular_price === null
                  ? "No price"
                  : peso(item.regular_price)}
            </Text>
            <Ionicons name="chevron-forward" size={22} color={C.muted} />
          </Pressable>
        )}
      />
    </View>
  );
}

function Inventory({
  products,
  categories,
  locationId,
  onSaved,
}: {
  products: Product[];
  categories: Category[];
  locationId: string;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );
  const [quantity, setQuantity] = useState("");
  const [mode, setMode] = useState<"stock_in" | "damage">("stock_in");
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Other";
  const filtered = products.filter(
    (p) =>
      (!category || p.category_id === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const save = async () => {
    const amount = Number(quantity);
    if (!selected || !Number.isInteger(amount) || amount <= 0)
      return Alert.alert(
        "Check quantity",
        "Enter a whole number greater than zero.",
      );
    const { error } = selectedVariant
      ? await supabase.rpc("record_variant_inventory_movement", {
          p_location_id: locationId,
          p_variant_id: selectedVariant.id,
          p_type: mode,
          p_quantity: amount,
          p_note:
            mode === "damage" ? "Damaged product choice" : "Choice stock added",
        })
      : await supabase.rpc("record_inventory_movement", {
          p_location_id: locationId,
          p_product_id: selected.id,
          p_type: mode,
          p_quantity: amount,
          p_note: mode === "damage" ? "Damaged product" : "Stock added",
        });
    if (error) return Alert.alert("Stock not saved", error.message);
    setSelected(null);
    setSelectedVariant(null);
    setQuantity("");
    await onSaved();
    Alert.alert(
      "Stock updated",
      mode === "damage"
        ? `${amount} damaged recorded.`
        : `${amount} added to stock.`,
    );
  };
  if (selected && selected.variants.length && !selectedVariant)
    return (
      <View style={s.flex}>
        <Back
          title={`Choose ${selected.variant_label ?? "option"}`}
          onPress={() => setSelected(null)}
        />
        <Text style={s.subtitle}>{selected.name}</Text>
        <FlatList
          data={selected.variants}
          keyExtractor={(variant) => variant.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <Pressable
              style={s.listRow}
              onPress={() => setSelectedVariant(item)}
            >
              <View style={s.variantLetter}>
                <Text style={s.variantLetterText}>{item.name}</Text>
              </View>
              <View style={s.flex}>
                <Text style={s.rowTitle}>
                  {selected.variant_label ?? "Choice"} {item.name}
                </Text>
                <Text style={s.rowHelp}>
                  {item.quantity_on_hand} currently in stock
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={C.teal} />
            </Pressable>
          )}
        />
      </View>
    );
  if (selected)
    return (
      <ScrollView contentContainerStyle={s.scroll}>
        <Back
          title="Update stock"
          onPress={() => {
            if (selectedVariant) setSelectedVariant(null);
            else setSelected(null);
          }}
        />
        <View style={s.editCard}>
          <View style={s.editHeading}>
            <View style={s.productMiniIcon}>
              <Ionicons
                name={productIcon(
                  selected.name,
                  categoryName(selected.category_id),
                )}
                size={27}
                color={C.accent}
              />
            </View>
            <View style={s.flex}>
              <Text style={s.editName}>{selected.name}</Text>
              {selectedVariant ? (
                <Text style={s.variantChosen}>
                  {selected.variant_label ?? "Choice"}: {selectedVariant.name}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={s.stockBig}>
            {selectedVariant?.quantity_on_hand ?? selected.quantity_on_hand}
          </Text>
          <Text style={s.stockLabel}>currently in stock</Text>
          <Text style={s.section}>What happened?</Text>
          <View style={s.choiceRow}>
            <Choice
              label="Add stock"
              icon="add-circle-outline"
              selected={mode === "stock_in"}
              onPress={() => setMode("stock_in")}
            />
            <Choice
              label="Damaged"
              icon="warning-outline"
              selected={mode === "damage"}
              danger
              onPress={() => setMode("damage")}
            />
          </View>
          <Label>How many?</Label>
          <TextInput
            style={s.qtyInput}
            keyboardType="number-pad"
            placeholder="0"
            value={quantity}
            onChangeText={setQuantity}
            autoFocus
          />
          <BigButton
            label={mode === "damage" ? "Record damaged items" : "Add to stock"}
            icon={mode === "damage" ? "warning-outline" : "add-circle-outline"}
            onPress={save}
            danger={mode === "damage"}
          />
        </View>
      </ScrollView>
    );
  return (
    <View style={s.flex}>
      <Text style={s.pageTitle}>Stock</Text>
      <Text style={s.subtitle}>Tap a product to update its stock.</Text>
      <Search value={search} onChange={setSearch} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
      >
        <Chip
          label="All products"
          icon="apps"
          selected={!category}
          onPress={() => setCategory(null)}
        />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            icon={categoryIcon(c.name)}
            selected={category === c.id}
            onPress={() => setCategory(c.id)}
          />
        ))}
      </ScrollView>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const low = item.quantity_on_hand <= item.low_stock_threshold;
          return (
            <Pressable style={s.listRow} onPress={() => setSelected(item)}>
              <View style={s.listIcon}>
                <Ionicons
                  name={productIcon(item.name, categoryName(item.category_id))}
                  size={24}
                  color={low ? C.orange : C.accent}
                />
              </View>
              <View style={s.flex}>
                <Text style={s.rowTitle}>{item.name}</Text>
                <Text style={[s.rowHelp, low && s.low]}>
                  {item.needs_stock_count
                    ? "Stock count needed"
                    : item.variants.length
                      ? `${item.variants.length} choices · tap to see each one`
                      : low
                        ? "Low stock"
                        : "In stock"}
                </Text>
              </View>
              <View style={[s.stockNum, low && s.stockNumLow]}>
                <Text style={[s.stockNumText, low && s.low]}>
                  {item.quantity_on_hand}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={C.muted} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function More({
  profile,
  onOpen,
  onGuide,
}: {
  profile: Profile | null;
  onOpen: (x: Screen) => void;
  onGuide: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.pageTitle}>More</Text>
      <Text style={s.subtitle}>Simple tools for this shop.</Text>
      <Menu
        icon="pricetags-outline"
        title="Products & prices"
        help="View products and change prices"
        color={C.accent}
        soft={C.accentSoft}
        onPress={() => onOpen("products")}
      />
      <Menu
        icon="bar-chart-outline"
        title="Sales reports"
        help="Daily, weekly or monthly reports"
        color={C.purple}
        soft={C.purpleSoft}
        onPress={() => onOpen("reports")}
      />
      <Menu
        icon="help-circle-outline"
        title="How to use Mik"
        help="Replay the simple step-by-step guide"
        color={C.green}
        soft={C.soft}
        onPress={onGuide}
      />
      <Text style={s.section}>Shop login</Text>
      <View style={s.account}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {(profile?.display_name ?? "S")[0].toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={s.rowTitle}>{profile?.display_name ?? "Shop user"}</Text>
          <Text style={s.rowHelp}>This login belongs to this shop only</Text>
        </View>
      </View>
      <Pressable style={s.signout} onPress={() => supabase.auth.signOut()}>
        <Ionicons name="log-out-outline" size={22} color={C.red} />
        <Text style={s.signoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

type GuideFlow = { icon: Icon; label: string };
type GuideStep = { title: string; body: string; icon: Icon; flow: GuideFlow[] };
const guideSteps: GuideStep[] = [
  {
    title: "Welcome to Mik",
    body: "The four buttons at the bottom take you to everything you need.",
    icon: "sparkles",
    flow: [
      { icon: "cart-outline", label: "Sell" },
      { icon: "today-outline", label: "Today" },
      { icon: "cube-outline", label: "Stock" },
      { icon: "grid-outline", label: "More" },
    ],
  },
  {
    title: "Make a sale",
    body: "Tap the product photo. If it has choices, tap the letter, colour, or size. Check the quantity, then confirm payment.",
    icon: "cart",
    flow: [
      { icon: "cart-outline", label: "Sell" },
      { icon: "image-outline", label: "Product" },
      { icon: "receipt-outline", label: "Review" },
      { icon: "cash-outline", label: "Pay" },
    ],
  },
  {
    title: "See what sold today",
    body: "Today shows the sales total, number of items, sold products, and each receipt.",
    icon: "today",
    flow: [
      { icon: "today-outline", label: "Today" },
      { icon: "bag-check-outline", label: "Sold items" },
      { icon: "receipt-outline", label: "Receipts" },
    ],
  },
  {
    title: "Check and change stock",
    body: "Open Stock and choose a product. For products with choices, choose the letter, colour, or size before changing stock.",
    icon: "cube",
    flow: [
      { icon: "cube-outline", label: "Stock" },
      { icon: "image-outline", label: "Product" },
      { icon: "add-circle-outline", label: "Add stock" },
    ],
  },
  {
    title: "Create or edit a product",
    body: "Under More, open Products & prices. Add the photo, price, and stock. Turn on choices for letters A–Z, colours, or sizes.",
    icon: "pricetags",
    flow: [
      { icon: "grid-outline", label: "More" },
      { icon: "pricetags-outline", label: "Products" },
      { icon: "camera-outline", label: "Photo" },
      { icon: "save-outline", label: "Save" },
    ],
  },
  {
    title: "View sales reports",
    body: "Choose Daily, Weekly, Monthly, or pick an exact date on the calendar.",
    icon: "bar-chart",
    flow: [
      { icon: "grid-outline", label: "More" },
      { icon: "bar-chart-outline", label: "Reports" },
      { icon: "calendar-outline", label: "Choose date" },
    ],
  },
  {
    title: "Export for Excel",
    body: "Choose the period first, then tap Export for Excel. Save or share the sales list.",
    icon: "download",
    flow: [
      { icon: "calendar-outline", label: "Period" },
      { icon: "download-outline", label: "Export" },
      { icon: "share-social-outline", label: "Save or share" },
    ],
  },
];

function GuideModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);
  const item = guideSteps[step];
  const last = step === guideSteps.length - 1;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={s.guideOverlay}>
        <View style={s.guideCard}>
          <View style={s.guideHeader}>
            <Text style={s.guideKicker}>MIK GUIDE</Text>
            <Text style={s.guideCount}>
              {step + 1} of {guideSteps.length}
            </Text>
            <Pressable
              accessibilityLabel="Close guide"
              style={s.guideClose}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color={C.muted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={s.guideContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.guideHero}>
              <Ionicons name={item.icon} size={48} color={C.white} />
            </View>
            <Text style={s.guideTitle}>{item.title}</Text>
            <Text style={s.guideBody}>{item.body}</Text>
            <View style={s.guideFlow}>
              {item.flow.map((part, index) => (
                <View key={`${part.label}-${index}`} style={s.guideFlowPart}>
                  {index > 0 ? (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={C.muted}
                    />
                  ) : null}
                  <View style={s.guideFlowItem}>
                    <Ionicons name={part.icon} size={25} color={C.green} />
                    <Text style={s.guideFlowLabel}>{part.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={s.guideDots}>
            {guideSteps.map((_, index) => (
              <View
                key={index}
                style={[s.guideDot, index === step && s.guideDotOn]}
              />
            ))}
          </View>
          <View style={s.guideActions}>
            {step > 0 ? (
              <Pressable
                style={s.guideBack}
                onPress={() => setStep((n) => n - 1)}
              >
                <Ionicons name="arrow-back" size={21} color={C.dark} />
                <Text style={s.guideBackText}>Back</Text>
              </Pressable>
            ) : (
              <Pressable style={s.guideBack} onPress={onClose}>
                <Text style={s.guideBackText}>Skip</Text>
              </Pressable>
            )}
            <Pressable
              style={s.guideNext}
              onPress={() => (last ? onClose() : setStep((n) => n + 1))}
            >
              <Text style={s.guideNextText}>
                {last ? "Start using Mik" : "Next"}
              </Text>
              <Ionicons
                name={last ? "checkmark-circle" : "arrow-forward"}
                size={22}
                color={C.white}
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}
function Back({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={s.back}>
      <Pressable style={s.backButton} onPress={onPress}>
        <Ionicons name="arrow-back" size={25} color={C.ink} />
      </Pressable>
      <Text style={s.backTitle}>{title}</Text>
    </View>
  );
}
function Step({ number, children }: { number: string; children: ReactNode }) {
  return (
    <View style={s.step}>
      <View style={s.stepCircle}>
        <Text style={s.stepNumber}>{number}</Text>
      </View>
      <Text style={s.stepText}>{children}</Text>
    </View>
  );
}
function Search({
  value,
  onChange,
}: {
  value: string;
  onChange: (x: string) => void;
}) {
  return (
    <View style={s.search}>
      <Ionicons name="search" size={22} color={C.muted} />
      <TextInput
        style={s.searchInput}
        placeholder="Search product"
        value={value}
        onChangeText={onChange}
      />
      {value ? (
        <Pressable onPress={() => onChange("")}>
          <Ionicons name="close-circle" size={24} color={C.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
function Chip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: Icon;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[s.chip, selected && s.chipOn]} onPress={onPress}>
      {icon ? (
        <Ionicons name={icon} size={19} color={selected ? C.white : C.accent} />
      ) : null}
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}
function Quantity({
  value,
  minus,
  plus,
}: {
  value: number;
  minus: () => void;
  plus: () => void;
}) {
  return (
    <View style={s.quantity}>
      <Pressable style={s.qtyButton} onPress={minus}>
        <Ionicons name="remove" size={24} color={C.dark} />
      </Pressable>
      <Text style={s.qtyNumber}>{value}</Text>
      <Pressable style={s.qtyButton} onPress={plus}>
        <Ionicons name="add" size={24} color={C.dark} />
      </Pressable>
    </View>
  );
}
function Choice({
  label,
  icon,
  selected,
  danger,
  onPress,
}: {
  label: string;
  icon: Icon;
  selected: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        s.choice,
        selected && s.choiceOn,
        selected && danger && s.choiceDanger,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={27}
        color={selected ? (danger ? C.red : C.green) : C.muted}
      />
      <Text
        style={[s.choiceText, selected && { color: danger ? C.red : C.dark }]}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons
          name="checkmark-circle"
          size={21}
          color={danger ? C.red : C.green}
        />
      ) : null}
    </Pressable>
  );
}
function BigButton({
  label,
  onPress,
  disabled,
  icon,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: Icon;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={[
        s.bigButton,
        danger && { backgroundColor: C.red },
        disabled && s.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon ? <Ionicons name={icon} size={23} color={C.white} /> : null}
      <Text style={s.bigButtonText}>{label}</Text>
    </Pressable>
  );
}
function Stat({
  label,
  value,
  icon,
  color = C.green,
}: {
  label: string;
  value: string;
  icon: Icon;
  color?: string;
}) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
    </View>
  );
}
function Menu({
  icon,
  title,
  help,
  color = C.green,
  soft = C.soft,
  onPress,
}: {
  icon: Icon;
  title: string;
  help: string;
  color?: string;
  soft?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.menu} onPress={onPress}>
      <View style={[s.menuIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={27} color={color} />
      </View>
      <View style={s.flex}>
        <Text style={s.menuTitle}>{title}</Text>
        <Text style={s.rowHelp}>{help}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={color} />
    </Pressable>
  );
}
function Empty({ title }: { title: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name="checkmark-circle-outline" size={34} color={C.green} />
      <Text style={s.rowTitle}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  app: { flex: 1, backgroundColor: C.cream },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: C.cream,
  },
  login: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    backgroundColor: C.cream,
  },
  loginCard: {
    width: "100%",
    maxWidth: 440,
    padding: 28,
    borderRadius: 30,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#7384B8",
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  brandLogo: { width: 150, height: 150, alignSelf: "center" },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: C.green,
    shadowColor: C.green,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  brand: {
    marginTop: 14,
    textAlign: "center",
    color: C.green,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 3,
  },
  loginTitle: {
    marginTop: 4,
    color: C.ink,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "900",
    textAlign: "center",
  },
  centerHelp: {
    color: C.muted,
    fontSize: 17,
    lineHeight: 25,
    textAlign: "center",
    marginBottom: 16,
  },
  help: { color: C.muted, fontSize: 16, lineHeight: 24 },
  label: {
    marginTop: 18,
    marginBottom: 7,
    color: C.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  input: {
    minHeight: 56,
    paddingHorizontal: 17,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 18,
    color: C.ink,
    backgroundColor: C.white,
    fontSize: 17,
  },
  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 15,
    color: C.red,
    backgroundColor: C.redSoft,
    fontSize: 15,
    fontWeight: "700",
  },
  setup: {
    flex: 1,
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    justifyContent: "center",
    padding: 26,
    backgroundColor: C.cream,
  },
  kicker: {
    color: C.green,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  guidePreview: {
    minHeight: 48,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  guidePreviewText: { color: C.dark, fontSize: 15, fontWeight: "800" },
  top: {
    minHeight: 68,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  shopLogo: { width: 42, height: 42, borderRadius: 13 },
  shopIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.soft,
  },
  shopName: { color: C.ink, fontSize: 17, fontWeight: "900" },
  locationName: {
    marginTop: 2,
    color: C.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  ready: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.accentSoft,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  readyText: { color: C.accentDark, fontSize: 12, fontWeight: "800" },
  locationBar: {
    minHeight: 56,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.white,
  },
  locationLabel: { color: C.muted, fontSize: 14, fontWeight: "800" },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  nav: {
    minHeight: 76,
    paddingHorizontal: 8,
    paddingBottom: 4,
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  navItem: {
    flex: 1,
    minHeight: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  navIcon: {
    width: 48,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
  navIconOn: { backgroundColor: C.green },
  navText: { marginTop: 3, color: C.muted, fontSize: 12, fontWeight: "700" },
  navTextOn: { color: C.dark, fontWeight: "900" },
  adminTop: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  adminSignout: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.redSoft,
  },
  adminPage: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 38,
  },
  adminHero: { padding: 20, borderRadius: 20, backgroundColor: C.dark },
  adminShop: {
    minHeight: 82,
    marginBottom: 9,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    backgroundColor: C.white,
  },
  shopAvatar: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.soft,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.soft,
  },
  statusText: {
    color: C.green,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  pageTitle: {
    marginTop: 18,
    color: C.ink,
    fontSize: 30,
    lineHeight: 39,
    fontWeight: "900",
  },
  subtitle: { marginTop: 4, color: C.muted, fontSize: 16, lineHeight: 24 },
  scroll: { paddingBottom: 34 },
  step: {
    marginTop: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    backgroundColor: C.soft,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.green,
  },
  stepNumber: { color: C.white, fontSize: 16, fontWeight: "900" },
  stepText: {
    flex: 1,
    color: C.dark,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "800",
  },
  search: {
    minHeight: 56,
    marginTop: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 18,
    backgroundColor: C.white,
  },
  searchInput: { flex: 1, minHeight: 52, color: C.ink, fontSize: 17 },
  chips: { minHeight: 60, gap: 9, alignItems: "center", paddingVertical: 9 },
  chip: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 23,
    backgroundColor: C.white,
  },
  chipOn: { borderColor: C.green, backgroundColor: C.green },
  chipText: { color: C.ink, fontSize: 14, fontWeight: "800" },
  chipTextOn: { color: C.white },
  productList: { paddingBottom: 26 },
  productListBasket: { paddingBottom: 118 },
  productRow: { gap: 11 },
  productCard: {
    flex: 1,
    minHeight: 208,
    marginBottom: 11,
    padding: 13,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 22,
    backgroundColor: C.white,
    shadowColor: "#8190B6",
    shadowOpacity: 0.09,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  disabled: { opacity: 0.48 },
  productOn: {
    borderWidth: 2.5,
    borderColor: C.green,
    backgroundColor: "#FCFDFF",
  },
  productVisual: {
    height: 104,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    marginBottom: 10,
    backgroundColor: "#EEF2F7",
  },
  productCardImage: { width: "100%", height: "100%" },
  missingPhoto: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#EEF2F7",
  },
  missingPhotoText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 0.7,
    textAlign: "center",
  },
  miniProductImage: { width: 46, height: 46, borderRadius: 14 },
  miniMissingPhoto: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#EEF2F7",
  },
  miniMissingText: {
    color: C.muted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: 5,
    right: 5,
    minWidth: 32,
    height: 32,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.green,
  },
  badgeText: { color: C.white, fontSize: 16, fontWeight: "900" },
  productName: {
    minHeight: 42,
    color: C.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  productPrice: {
    marginTop: 5,
    color: C.dark,
    fontSize: 20,
    fontWeight: "900",
  },
  saleLine: { marginTop: 4, color: C.red, fontSize: 10, fontWeight: "900" },
  oldPrice: { color: C.muted, textDecorationLine: "line-through" },
  stock: { marginTop: 6, color: C.green, fontSize: 12, fontWeight: "700" },
  low: { color: C.orange, fontWeight: "800" },
  basket: {
    position: "absolute",
    left: -16,
    right: -16,
    bottom: 0,
    minHeight: 100,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  basketCount: { color: C.muted, fontSize: 13, fontWeight: "700" },
  basketTotal: { marginTop: 2, color: C.ink, fontSize: 25, fontWeight: "900" },
  reviewButton: {
    minHeight: 60,
    paddingHorizontal: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 20,
    backgroundColor: C.green,
  },
  reviewText: { color: C.white, fontSize: 16, fontWeight: "900" },
  back: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    backgroundColor: C.white,
  },
  backTitle: { color: C.ink, fontSize: 22, fontWeight: "900" },
  cartRow: {
    minHeight: 88,
    marginTop: 10,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 19,
    backgroundColor: C.white,
  },
  rowTitle: { color: C.ink, fontSize: 16, fontWeight: "900" },
  rowHelp: { marginTop: 3, color: C.muted, fontSize: 13, lineHeight: 18 },
  lineTotal: {
    minWidth: 65,
    color: C.ink,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "right",
  },
  quantity: { flexDirection: "row", alignItems: "center", gap: 5 },
  qtyButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.soft,
  },
  qtyNumber: {
    minWidth: 28,
    color: C.ink,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  totalBox: {
    marginTop: 14,
    padding: 19,
    borderRadius: 22,
    backgroundColor: C.dark,
  },
  totalLabel: { color: "#DDE4FF", fontSize: 15, fontWeight: "700" },
  totalValue: { marginTop: 5, color: C.white, fontSize: 34, fontWeight: "900" },
  section: {
    marginTop: 24,
    marginBottom: 9,
    color: C.ink,
    fontSize: 19,
    fontWeight: "900",
  },
  choiceRow: { flexDirection: "row", gap: 10 },
  choice: {
    flex: 1,
    minHeight: 84,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 20,
    backgroundColor: C.white,
  },
  choiceOn: { borderWidth: 2.5, borderColor: C.green, backgroundColor: C.soft },
  choiceDanger: { borderColor: C.red, backgroundColor: C.redSoft },
  choiceText: { color: C.muted, fontSize: 15, fontWeight: "800" },
  bigButton: {
    minHeight: 62,
    marginTop: 18,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 21,
    backgroundColor: C.green,
    shadowColor: C.green,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  bigButtonText: { color: C.white, fontSize: 17, fontWeight: "900" },
  safe: { marginTop: 11, color: C.muted, fontSize: 13, textAlign: "center" },
  hero: {
    marginTop: 16,
    padding: 21,
    borderRadius: 24,
    backgroundColor: C.dark,
  },
  heroLabel: { color: "#DDE4FF", fontSize: 15, fontWeight: "700" },
  heroValue: { marginTop: 5, color: C.white, fontSize: 36, fontWeight: "900" },
  heroSmall: { marginTop: 5, color: "#DDE4FF", fontSize: 13 },
  stats: { marginTop: 10, flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 21,
    backgroundColor: C.white,
  },
  statLabel: { marginTop: 8, color: C.muted, fontSize: 13, fontWeight: "700" },
  statValue: { marginTop: 3, color: C.ink, fontSize: 20, fontWeight: "900" },
  soldRow: {
    minHeight: 66,
    marginBottom: 7,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    backgroundColor: C.white,
  },
  soldIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.accentSoft,
  },
  soldName: { flex: 1, color: C.ink, fontSize: 15, fontWeight: "800" },
  soldQty: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.green,
  },
  soldQtyText: { color: C.white, fontSize: 18, fontWeight: "900" },
  receipt: {
    marginBottom: 9,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 19,
    backgroundColor: C.white,
  },
  receiptTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  receiptRight: { alignItems: "flex-end" },
  paymentText: {
    marginTop: 3,
    color: C.accentDark,
    fontSize: 11,
    fontWeight: "900",
  },
  receiptItems: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderColor: "#EDF1F8",
    gap: 5,
  },
  receiptProduct: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  attention: {
    minHeight: 72,
    marginBottom: 8,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 19,
    backgroundColor: C.orangeSoft,
  },
  alertIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#FFE1B5",
  },
  editCard: {
    marginTop: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    backgroundColor: C.white,
  },
  editHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  editName: { color: C.ink, fontSize: 22, fontWeight: "900" },
  productMiniIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.accentSoft,
  },
  productPhoto: {
    width: "100%",
    height: 190,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#EEF2F7",
  },
  productPhotoImage: { width: "100%", height: "100%" },
  priceInput: {
    minHeight: 60,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 13,
    color: C.ink,
    fontSize: 24,
    fontWeight: "700",
  },
  note: {
    marginTop: 16,
    padding: 12,
    flexDirection: "row",
    gap: 9,
    borderRadius: 12,
    backgroundColor: C.soft,
  },
  noteText: { flex: 1, color: C.dark, fontSize: 14, lineHeight: 20 },
  list: { paddingVertical: 10, paddingBottom: 28 },
  listRow: {
    minHeight: 78,
    marginBottom: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
  },
  listIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: C.accentSoft,
  },
  listImage: { width: 52, height: 52, borderRadius: 14 },
  listMissingPhoto: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#EEF2F7",
  },
  listMissingText: {
    color: C.muted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    textAlign: "center",
  },
  rowPrice: { color: C.dark, fontSize: 16, fontWeight: "900" },
  stockBig: {
    marginTop: 22,
    color: C.dark,
    fontSize: 48,
    fontWeight: "900",
    textAlign: "center",
  },
  stockLabel: { color: C.muted, fontSize: 14, textAlign: "center" },
  qtyInput: {
    minHeight: 76,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    color: C.ink,
    backgroundColor: C.cream,
    fontSize: 36,
    fontWeight: "800",
    textAlign: "center",
  },
  stockNum: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.soft,
  },
  stockNumLow: { backgroundColor: C.orangeSoft },
  stockNumText: { color: C.dark, fontSize: 19, fontWeight: "900" },
  menu: {
    minHeight: 90,
    marginTop: 10,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
    backgroundColor: C.white,
  },
  menuIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: C.soft,
  },
  menuTitle: { color: C.ink, fontSize: 17, fontWeight: "900" },
  locationCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    backgroundColor: C.white,
  },
  locationRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: "#EDF1F8",
  },
  addLocation: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addText: { color: C.green, fontSize: 15, fontWeight: "900" },
  cancel: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  account: {
    minHeight: 80,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 21,
    backgroundColor: C.white,
  },
  avatar: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: C.green,
  },
  avatarText: { color: C.white, fontSize: 21, fontWeight: "900" },
  signout: {
    minHeight: 58,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#F0C8D0",
    borderRadius: 20,
    backgroundColor: C.redSoft,
  },
  signoutText: { color: C.red, fontSize: 16, fontWeight: "900" },
  empty: {
    marginTop: 16,
    padding: 24,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 21,
    backgroundColor: C.white,
  },
  guideOverlay: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(32,50,77,.56)",
  },
  guideCard: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "92%",
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: C.white,
    shadowColor: "#15233A",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  guideHeader: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  guideKicker: {
    color: C.accentDark,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  guideCount: {
    marginLeft: "auto",
    marginRight: 10,
    color: C.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  guideClose: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.cream,
  },
  guideContent: { padding: 22, alignItems: "center" },
  guideHero: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: C.green,
  },
  guideTitle: {
    marginTop: 18,
    color: C.ink,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: "900",
    textAlign: "center",
  },
  guideBody: {
    marginTop: 9,
    color: C.muted,
    fontSize: 17,
    lineHeight: 25,
    textAlign: "center",
  },
  guideFlow: {
    width: "100%",
    marginTop: 22,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
  },
  guideFlowPart: { flexShrink: 1, flexDirection: "row", alignItems: "center" },
  guideFlowItem: {
    minWidth: 66,
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 16,
    backgroundColor: C.soft,
  },
  guideFlowLabel: {
    color: C.dark,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  guideDots: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  guideDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  guideDotOn: { width: 22, backgroundColor: C.green },
  guideActions: { padding: 16, paddingTop: 4, flexDirection: "row", gap: 10 },
  guideBack: {
    minHeight: 58,
    minWidth: 92,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 19,
    backgroundColor: C.white,
  },
  guideBackText: { color: C.dark, fontSize: 16, fontWeight: "800" },
  guideNext: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 19,
    backgroundColor: C.green,
  },
  guideNextText: { color: C.white, fontSize: 16, fontWeight: "900" },
  gcashCheck: {
    marginTop: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 22,
    backgroundColor: C.white,
  },
  gcashHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  gcashIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.soft,
  },
  receivedButton: {
    minHeight: 60,
    marginTop: 14,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderWidth: 2,
    borderColor: C.green,
    borderRadius: 19,
    backgroundColor: C.soft,
  },
  receivedButtonOn: { backgroundColor: C.accent, borderColor: C.accent },
  receivedText: {
    flexShrink: 1,
    color: C.dark,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  receivedTextOn: { color: C.white },
  referenceText: {
    marginTop: 2,
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  variantChosen: {
    marginTop: 3,
    color: C.teal,
    fontSize: 14,
    fontWeight: "900",
  },
  variantHint: { marginTop: 4, color: C.teal, fontSize: 12, fontWeight: "900" },
  variantOverlay: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(32,50,77,.56)",
  },
  variantCard: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "86%",
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: C.white,
  },
  variantHeader: {
    minHeight: 78,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  variantKicker: {
    color: C.teal,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  variantTitle: { marginTop: 3, color: C.ink, fontSize: 21, fontWeight: "900" },
  variantGrid: { padding: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  variantButton: {
    width: "22%",
    minWidth: 72,
    minHeight: 70,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 18,
    backgroundColor: C.tealSoft,
  },
  variantButtonText: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  variantStock: {
    marginTop: 3,
    color: C.teal,
    fontSize: 11,
    fontWeight: "800",
  },
  choiceSetup: {
    marginTop: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 22,
    backgroundColor: C.cream,
  },
  choiceSetupTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  choiceToggle: {
    minWidth: 64,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.border,
  },
  choiceToggleOn: { backgroundColor: C.teal },
  choiceToggleText: { color: C.muted, fontSize: 14, fontWeight: "900" },
  choiceToggleTextOn: { color: C.white },
  alphabetButton: {
    minHeight: 54,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.green,
    borderRadius: 18,
    backgroundColor: C.soft,
  },
  alphabetText: { color: C.dark, fontSize: 16, fontWeight: "900" },
  choiceInput: { minHeight: 92, textAlignVertical: "top", paddingTop: 15 },
  choicePills: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  choicePill: {
    minWidth: 42,
    minHeight: 38,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.tealSoft,
  },
  choicePillText: { color: C.teal, fontSize: 14, fontWeight: "900" },
  variantLetter: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.tealSoft,
  },
  variantLetterText: { color: C.teal, fontSize: 18, fontWeight: "900" },
});
