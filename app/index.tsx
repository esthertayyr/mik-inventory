import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabase";
import { peso, shortDate } from "@/src/lib/format";
import { ReportsScreen } from "@/src/components/ReportsScreen";
import { OrdersScreen } from "@/src/components/OrdersScreen";
import { PrintersScreen } from "@/src/components/PrintersScreen";
import { FilamentsScreen } from "@/src/components/FilamentsScreen";
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

const APP_FONT = Platform.select({
  web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  ios: "System",
  android: "sans-serif",
  default: "System",
});

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[{ fontFamily: APP_FONT }, style]} />;
}

function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput {...props} style={[{ fontFamily: APP_FONT }, style]} />;
}

const C = {
  ink: "#101318",
  muted: "#626A73",
  green: "#142C47",
  dark: "#0D1722",
  soft: "#F6F7F8",
  accent: "#264A3B",
  accentDark: "#193529",
  accentSoft: "#F3F6F4",
  teal: "#29465B",
  tealSoft: "#F3F5F7",
  purple: "#65243A",
  purpleSoft: "#F8F4F5",
  cream: "#FFFFFF",
  white: "#FFFFFF",
  border: "#E0E3E7",
  orange: "#795C2D",
  orangeSoft: "#F8F6F1",
  red: "#65243A",
  redSoft: "#F8F4F5",
};
type Icon = keyof typeof Ionicons.glyphMap;
function categoryIcon(name: string): Icon {
  const n = name.toLowerCase();
  if (n.includes("keyboard") || n.includes("clicker") || n.includes("keycap")) return "keypad";
  if (n.includes("fidget")) return "sync";
  if (n.includes("keychain")) return "key";
  if (n.includes("decor") || n.includes("display")) return "sparkles";
  if (n.includes("home") || n.includes("gift")) return "home";
  return "cube";
}
function categoryTone(name: string) {
  const n = name.toLowerCase();
  if (n.includes("keyboard") || n.includes("clicker") || n.includes("keycap")) return { color: "#102A43", soft: "#F5F8FA" };
  if (n.includes("fidget") || n.includes("flexi")) return { color: "#29473A", soft: "#F6F8F7" };
  if (n.includes("keychain") || n.includes("charm")) return { color: "#70263A", soft: "#FAF6F7" };
  if (n.includes("decor") || n.includes("display")) return { color: "#5A405F", soft: "#F9F6F9" };
  if (n.includes("home") || n.includes("gift") || n.includes("desk")) return { color: "#49384E", soft: "#F8F6F8" };
  return { color: "#294B61", soft: "#F6F8F9" };
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
function placeholderImage(name: string) {
  const value = name.toLowerCase();
  if (value.includes("keyboard") || value.includes("clicker"))
    return require("../assets/product-placeholders/keyboard-clicker.png");
  if (value.includes("dragon"))
    return require("../assets/product-placeholders/rainbow-dragon.png");
  if (value.includes("starfish"))
    return require("../assets/product-placeholders/starfish-fidget.png");
  return null;
}
const ownerNav: {
  id: Screen;
  label: string;
  icon: Icon;
  color: string;
  soft: string;
}[] = [
  {
    id: "home",
    label: "Home",
    icon: "home-outline",
    color: C.green,
    soft: C.soft,
  },
  {
    id: "sell_start",
    label: "Sell",
    icon: "cart-outline",
    color: C.green,
    soft: C.soft,
  },
  {
    id: "orders",
    label: "Orders",
    icon: "clipboard-outline",
    color: C.purple,
    soft: C.purpleSoft,
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
  const [iconsReady] = useFonts(Ionicons.font);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!iconsReady)
    return <SafeAreaView style={s.loading}><ActivityIndicator size="large" color={C.green} /></SafeAreaView>;
  return session ? <SignedIn session={session} /> : <Login />;
}

function Login() {
  const { width } = useWindowDimensions();
  const wide = width >= 820;
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
    if (clean === "sebu3d" || clean === "3dprints") {
      setError("Please use the new shop username: pixelbug");
      return;
    }
    setBusy(true);
    setError("");
    // Keep the existing Supabase identity behind the scenes while presenting the
    // shop's new, friendlier username. This avoids replacing the account and
    // preserves all memberships, products, stock and sales history.
    const authUsername = clean === "pixelbug" ? "sebu3d" : clean;
    const { error: e } = await supabase.auth.signInWithPassword({
      email: `${authUsername}@login.mik.app`,
      password,
    });
    setBusy(false);
    if (e)
      setError("The username or password is not correct. Please try again.");
  };
  return (
    <SafeAreaView style={s.login}>
      <StatusBar style="dark" />
      <View style={[s.loginShell, wide && s.loginShellWide]}>
        {wide ? <View style={s.loginEditorial}><Text style={s.loginKicker}>MIK · SIMPLE SHOPKEEPING</Text><Text style={s.loginEditorialTitle}>Your shop, beautifully organised.</Text><Text style={s.loginEditorialBody}>Sales, stock and customer orders—clear enough to understand at a glance.</Text><View style={s.loginEditorialRule}/><Text style={s.loginEditorialQuote}>Made for busy hands and calm decisions.</Text></View> : null}
        <View style={[s.loginCard, wide && s.loginCardWide]}>
        <Image
          source={require("../assets/mik-logo.png")}
          style={s.brandLogo}
          resizeMode="contain"
        />
        <Text style={s.loginTitle}>Welcome back.</Text>
        <Text style={s.centerHelp}>Sign in to manage your shop.</Text>
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
          label={busy ? "Opening your shop…" : "Continue"}
          icon="arrow-forward-circle-outline"
          onPress={signIn}
          disabled={busy}
        />
        <Pressable style={s.guidePreview} onPress={() => setGuideOpen(true)}>
          <Ionicons name="help-circle-outline" size={21} color={C.green} />
          <Text style={s.guidePreviewText}>See how Mik works</Text>
        </Pressable>
        </View>
      </View>
      <Text style={s.loginCredit}>Work produced by faith, labour prompted by love, and endurance inspired by hope. — 1 Thessalonians 1:3 · Made by ET for JM</Text>
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
  logo_url: string | null;
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
  const [password, setPassword] = useState("");
  const [openShop, setOpenShop] = useState<AdminShop | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,logo_url,slug,login_username,status,created_at")
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
    setPassword("");
    setShowForm(false);
    await load();
    Alert.alert(
      "Shop profile created",
      `${clean} can now log in to this shop.`,
    );
  };
  if (openShop)
    return (
      <ShopApp
        adminBusiness={openShop}
        onAdminExit={() => setOpenShop(null)}
      />
    );
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
                  {shop.slug === "sebu3d"
                    ? "pixelbug"
                    : shop.login_username ?? "No username connected"}
                </Text>
              </View>
              <View style={s.statusPill}>
                <Text style={s.statusText}>ACTIVE</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${shop.name}`}
                style={s.adminSignout}
                onPress={() => setOpenShop(shop)}
              >
                <Ionicons name="enter-outline" size={22} color={C.green} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ShopApp({
  session,
  adminBusiness,
  onAdminExit,
}: {
  session?: Session;
  adminBusiness?: AdminShop;
  onAdminExit?: () => void;
}) {
  const { width } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>("home");
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
  const [saleInProgress, setSaleInProgress] = useState(false);
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
            "id,business_id,name,regular_price,sale_price,image_url,variant_label,letters_required,low_stock_threshold,category_id,active,inventory_levels(quantity_on_hand,needs_stock_count,location_id),product_variants(id,name,price_override,active,variant_inventory_levels(quantity_on_hand,location_id)),alphabet_style:alphabet_styles!products_alphabet_style_id_fkey(id,name,alphabet_letter_inventory(letter,quantity_on_hand,needs_stock_count,location_id))",
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
            "id,receipt_number,payment_method,total,status,created_at,payment_confirmed_at,payment_reference,sale_items(product_name,variant_name,selected_letters,quantity)",
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
            letters_required: p.letters_required ?? 0,
            alphabet_style: p.alphabet_style
              ? {
                  id: p.alphabet_style.id,
                  name: p.alphabet_style.name,
                  letters: (p.alphabet_style.alphabet_letter_inventory ?? [])
                    .map((letter: any) => ({
                      letter: letter.letter,
                      quantity_on_hand: letter.quantity_on_hand ?? 0,
                      needs_stock_count: letter.needs_stock_count ?? true,
                    }))
                    .sort((a: any, b: any) => a.letter.localeCompare(b.letter)),
                }
              : null,
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
    if (adminBusiness) {
      setProfile({ id: "platform-admin", display_name: "Owner" });
      const b = { id: adminBusiness.id, name: adminBusiness.name, logo_url: adminBusiness.logo_url, role: "owner" } as Business;
      setBusiness(b);
      const { data: ld } = await supabase.from("locations").select("id,business_id,name").eq("business_id", b.id).eq("active", true).order("name");
      const list = (ld ?? []) as Location[];
      const first = list[0]?.id ?? "";
      setLocations(list);
      setLocationId(first);
      if (first) await loadData(b.id, first);
      setNeedsSetup(false);
      setLoading(false);
      return;
    }
    if (!session) return;
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,display_name")
        .eq("id", session.user.id)
        .maybeSingle(),
      supabase
        .from("business_memberships")
        .select("business_id,role,businesses(id,name,logo_url)")
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
      logo_url: member.businesses.logo_url ?? null,
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
  }, [adminBusiness, loadData, session]);
  useEffect(() => {
    initialize();
  }, [initialize]);
  useEffect(() => {
    if (loading || needsSetup || !business) return;
    const key = `mik-guide-v1-${session?.user.id ?? "platform-admin"}`;
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (seen !== "done") setGuideOpen(true);
      })
      .catch(() => setGuideOpen(true));
  }, [business, loading, needsSetup, session?.user.id]);
  const closeGuide = async () => {
    setGuideOpen(false);
    await AsyncStorage.setItem(`mik-guide-v1-${session?.user.id ?? "platform-admin"}`, "done").catch(
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
    setScreen("home");
    if (business) await loadData(business.id, id);
  };
  let body: ReactNode;
  if (screen === "home")
    body = (
      <QuickStart
        locationId={locationId}
        onOpen={(next) => {
          setScreen(next);
          if (next === "dashboard") void reload();
        }}
      />
    );
  else if (screen === "sale" || screen === "missed" || screen === "event_sale")
    body = (
      <SaleScreen
        key={`${locationId}-${screen}`}
        products={products}
        categories={categories}
        locationId={locationId}
        onSaved={reload}
        onPendingChange={setSaleInProgress}
        startPastSale={screen === "missed"}
        eventMode={screen === "event_sale"}
        onNavigate={setScreen}
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
        onHome={() => setScreen("home")}
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
  else if (screen === "sell_start")
    body = <SellStart onOpen={setScreen} />;
  else if (screen === "production")
    body = <ProductionStart onOpen={setScreen} />;
  else if (screen === "correct")
    body = <ReportsScreen locationId={locationId} correctionMode />;
  else if (screen === "shop")
    body = (
      <ShopProfile
        business={business!}
        onBack={() => setScreen("more")}
        onSaved={(logo_url) => setBusiness((current) => current ? { ...current, logo_url } : current)}
      />
    );
  else if (screen === "orders")
    body = <OrdersScreen businessId={business!.id} locationId={locationId} />;
  else if (screen === "printers")
    body = <PrintersScreen businessId={business!.id} locationId={locationId} onBack={() => setScreen("home")} />;
  else if (screen === "filaments")
    body = <FilamentsScreen businessId={business!.id} locationId={locationId} onBack={() => setScreen("home")} />;
  else if (screen === "price_list")
    body = (
      <PriceList
        products={products}
        categories={categories}
        business={business!}
        onBack={() => setScreen("home")}
        onEdit={() => setScreen("products")}
      />
    );
  else
    body = (
      <More
        profile={profile}
        business={business!}
        onOpen={setScreen}
        onGuide={() => setGuideOpen(true)}
      />
    );
  const selected =
    screen === "products" || screen === "reports" || screen === "shop" || screen === "printers" || screen === "filaments" || screen === "price_list"
      ? "more"
      : screen === "production"
        ? "home"
      : screen === "missed" || screen === "sale" || screen === "event_sale"
        ? "sell_start"
        : screen === "correct"
          ? "home"
          : screen;
  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="dark" />
      <View style={s.top}>
        {onAdminExit ? (
          <Pressable accessibilityLabel="Back to all shops" style={s.backButton} onPress={onAdminExit}>
            <Ionicons name="arrow-back" size={23} color={C.ink} />
          </Pressable>
        ) : null}
        <Image source={business?.logo_url ? { uri: business.logo_url } : require("../assets/mik-app-icon.png")} style={s.shopLogo} />
        <View style={s.flex}>
          <Text style={s.shopName} numberOfLines={1}>
            {business?.name}
          </Text>
          <Text style={s.locationName}>
            {(current?.name ?? "Shop location").toLowerCase().includes("sebu")
              ? "Pixelbug"
              : current?.name ?? "Shop location"}
          </Text>
        </View>
        {width < 900 ? <Pressable style={s.headerHome} onPress={() => setScreen("home")} accessibilityLabel="Go to home page">
          <Ionicons name="home" size={19} color={C.white} />
          <Text style={s.headerHomeText}>Home</Text>
        </Pressable> : <Text style={s.desktopBrand}>MIK</Text>}
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
      <View style={[s.workspace,width>=900&&s.desktopWorkspace]}>
      <View style={[s.content,width>=900&&s.desktopContent]}>{body}</View>
      <View style={[s.nav,width>=900&&s.desktopNav]}>
        {nav.map((item) => (
          <Pressable
            key={item.id}
            style={[s.navItem,width>=900&&s.desktopNavItem]}
            onPress={() => {
              const openScreen = () => {
                setScreen(item.id);
                if (item.id === "dashboard") void reload();
              };
              if ((screen === "sale" || screen === "missed") && saleInProgress && item.id !== "sale")
                Alert.alert(
                  "Keep this unfinished sale?",
                  "Leaving now will clear the selected products.",
                  [
                    { text: "Stay on sale", style: "cancel" },
                    { text: "Leave and clear", style: "destructive", onPress: () => { setSaleInProgress(false); openScreen(); } },
                  ],
                );
              else openScreen();
            }}
          >
            <View
              style={[
                s.navIcon,
                width>=900&&s.desktopNavIcon,
                {
                  backgroundColor: selected === item.id ? item.color : "transparent",
                },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={24}
                color={selected === item.id ? C.white : C.muted}
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

function SellStart({onOpen}:{onOpen:(screen:Screen)=>void}) {
  return <ScrollView contentContainerStyle={s.sellStartPage}>
    <Text style={s.pageTitle}>How are you selling?</Text>
    <Text style={s.subtitle}>Choose one to start.</Text>
    <Pressable style={[s.sellModeCard,{backgroundColor:"#F2F5F7"}]} onPress={()=>onOpen("sale")}><View style={[s.sellModeIcon,{backgroundColor:C.green}]}><Ionicons name="storefront" size={30} color={C.white}/></View><View style={s.flex}><Text style={s.sellModeTitle}>Shop sale</Text><Text style={s.sellModeHelp}>Normal everyday checkout</Text></View><Ionicons name="arrow-forward" size={23} color={C.green}/></Pressable>
    <Pressable style={[s.sellModeCard,{backgroundColor:C.accentSoft}]} onPress={()=>onOpen("event_sale")}><View style={[s.sellModeIcon,{backgroundColor:C.accent}]}><Ionicons name="flash" size={30} color={C.white}/></View><View style={s.flex}><Text style={s.sellModeTitle}>Event sale</Text><Text style={s.sellModeHelp}>Fast checkout for markets</Text></View><Ionicons name="arrow-forward" size={23} color={C.accent}/></Pressable>
    <Pressable style={s.earlierSale} onPress={()=>onOpen("missed")}><Ionicons name="calendar-outline" size={21} color={C.orange}/><View style={s.flex}><Text style={s.earlierSaleTitle}>Add an earlier sale</Text><Text style={s.earlierSaleHelp}>For sales entered on another day</Text></View><Ionicons name="chevron-forward" size={20} color={C.muted}/></Pressable>
  </ScrollView>;
}

function ProductionStart({onOpen}:{onOpen:(screen:Screen)=>void}) {
  return <ScrollView contentContainerStyle={s.sellStartPage}>
    <Text style={s.pageTitle}>Production</Text><Text style={s.subtitle}>What do you want to check?</Text>
    <Pressable style={[s.sellModeCard,{backgroundColor:"#EEF7F1"}]} onPress={()=>onOpen("printers")}><View style={[s.sellModeIcon,{backgroundColor:"#087A38"}]}><Ionicons name="hardware-chip" size={30} color={C.white}/></View><View style={s.flex}><Text style={s.sellModeTitle}>Printers</Text><Text style={s.sellModeHelp}>Working, attention or repair</Text></View><Ionicons name="arrow-forward" size={23} color="#087A38"/></Pressable>
    <Pressable style={[s.sellModeCard,{backgroundColor:"#F0F6F6"}]} onPress={()=>onOpen("filaments")}><View style={[s.sellModeIcon,{backgroundColor:"#315E68"}]}><Ionicons name="color-filter" size={30} color={C.white}/></View><View style={s.flex}><Text style={s.sellModeTitle}>Filaments</Text><Text style={s.sellModeHelp}>Brands, materials and colours</Text></View><Ionicons name="arrow-forward" size={23} color="#315E68"/></Pressable>
  </ScrollView>;
}

function SaleScreen({
  products,
  categories,
  locationId,
  onSaved,
  onPendingChange,
  startPastSale = false,
  eventMode = false,
  onNavigate,
}: {
  products: Product[];
  categories: Category[];
  locationId: string;
  onSaved: () => void;
  onPendingChange: (pending: boolean) => void;
  startPastSale?: boolean;
  eventMode?: boolean;
  onNavigate: (screen: Screen) => void;
}) {
  const { width } = useWindowDimensions();
  const productColumns = width >= 980 ? 4 : width >= 700 ? 3 : 2;
  const [category, setCategory] = useState<string | null>(null);
  const [saleCategoryOpen, setSaleCategoryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [choosing, setChoosing] = useState<Product | null>(null);
  const [chosenLetters, setChosenLetters] = useState<string[]>([]);
  const [chosenDesign, setChosenDesign] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [gcashReceived, setGcashReceived] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordPastSale, setRecordPastSale] = useState(startPastSale);
  const [pastSaleDate, setPastSaleDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [managerPasscode, setManagerPasscode] = useState("");
  useEffect(() => onPendingChange(cart.length > 0), [cart.length, onPendingChange]);
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Other";
  const filtered = products.filter(
    (p) =>
      (!category || p.category_id === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const choosingCategory = category === null && search.trim() === "";
  const saleContentWidth = Math.min(width, 1180) - (width >= 900 ? 56 : 36);
  const cardWidth =
    (saleContentWidth - (productColumns - 1) * 11) / productColumns;
  const total = cart.reduce((n, x) => n + x.quantity * x.unitPrice, 0);
  const cashAmount = Number(cashReceived);
  const cashIsEnough =
    payment !== "cash" ||
    (cashReceived.trim() !== "" && Number.isFinite(cashAmount) && cashAmount >= total);
  const changeDue = payment === "cash" && cashIsEnough ? cashAmount - total : 0;
  const count = cart.reduce((n, x) => n + x.quantity, 0);
  const cartKey = (
    productId: string,
    variantId?: string | null,
    letters: string[] = [],
  ) => `${productId}:${variantId ?? "main"}:${letters.join("")}`;
  const add = (
    p: Product,
    variant: ProductVariant | null = null,
    selectedLetters: string[] = [],
  ) => {
    if (p.letters_required > 0 && selectedLetters.length !== p.letters_required) {
      setChoosing(p);
      setChosenLetters([]);
      return;
    }
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
    const key = cartKey(p.id, variant?.id, selectedLetters);
    setCart((old) => {
      const found = old.find(
        (x) => cartKey(x.product.id, x.variant?.id, x.selectedLetters) === key,
      );
      if (found)
        return found.quantity >= available
          ? old
          : old.map((x) =>
              cartKey(x.product.id, x.variant?.id, x.selectedLetters) === key
                ? { ...x, quantity: x.quantity + 1 }
                : x,
            );
      return [
        ...old,
        { product: p, variant, selectedLetters, quantity: 1, unitPrice: price },
      ];
    });
    setChoosing(null);
    setChosenLetters([]);
    setChosenDesign(null);
  };
  const change = (key: string, n: number) =>
    setCart((old) =>
      old.flatMap((x) => {
        if (cartKey(x.product.id, x.variant?.id, x.selectedLetters) !== key)
          return [x];
        if (x.quantity + n <= 0) return [];
        const normalStock = x.variant?.quantity_on_hand ?? x.product.quantity_on_hand;
        const selectedLetterCounts = x.selectedLetters.reduce<Record<string, number>>(
          (counts, letter) => ({ ...counts, [letter]: (counts[letter] ?? 0) + 1 }),
          {},
        );
        const letterStock = x.selectedLetters.length
          ? Math.min(
              ...Object.entries(selectedLetterCounts).map(([letter, needed]) =>
                Math.floor(
                  (x.product.alphabet_style?.letters.find((item) => item.letter === letter)
                    ?.quantity_on_hand ?? 0) / needed,
                ),
              ),
            )
          : normalStock;
        const available = Math.min(normalStock, letterStock);
        if (n > 0 && x.quantity >= available) {
          Alert.alert(
            "Not enough letter stock",
            x.selectedLetters.length
              ? `Only ${available} matching set${available === 1 ? " is" : "s are"} available for ${x.selectedLetters.join(" · ")}. To sell another clicker with different letters, return to Sell and select the product again.`
              : `Only ${available} unit${available === 1 ? " is" : "s are"} available.`,
          );
          return [x];
        }
        return [{ ...x, quantity: Math.min(available, x.quantity + n) }];
      }),
    );
  const complete = async () => {
    if (!cart.length) return;
    if (recordPastSale && !/^\d{4}-\d{2}-\d{2}$/.test(pastSaleDate))
      return Alert.alert("Check the sale date", "Enter the date as YYYY-MM-DD, for example 2026-08-20.");
    if (recordPastSale && !/^\d{4,8}$/.test(managerPasscode))
      return Alert.alert("Enter the manager passcode", "Use the 4 to 8 digit shop passcode.");
    if (payment === "cash" && !cashIsEnough)
      return Alert.alert(
        "Not enough cash",
        `The customer still needs to give ${peso(Math.max(0, total - (Number.isFinite(cashAmount) ? cashAmount : 0)))}.`,
      );
    if (payment === "gcash" && !gcashReceived)
      return Alert.alert(
        "Check GCash first",
        "Confirm that the payment appeared in the shop’s GCash account.",
      );
    setSaving(true);
    const saleParams = {
        p_location_id: locationId,
        p_items: cart.map((x) => ({
          product_id: x.product.id,
          variant_id: x.variant?.id ?? null,
          selected_letters: x.selectedLetters,
          quantity: x.quantity,
        })),
        p_payment_method: payment,
        p_payment_received: payment === "cash" || gcashReceived,
        p_payment_reference:
          payment === "gcash" ? paymentReference.trim() : null,
      };
    const { data, error } = recordPastSale
      ? await supabase.rpc("create_backdated_sale_with_choices", {
          ...saleParams,
          p_sale_date: pastSaleDate,
          p_passcode: managerPasscode,
        })
      : await supabase.rpc("create_confirmed_sale_with_choices", saleParams);
    if (error) {
      setSaving(false);
      return Alert.alert(
        "Sale not saved",
        error.message.includes("passcode") || error.message.includes("date")
          ? error.message
          : "Please check the stock and try again.",
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
    setCashReceived("");
    setRecordPastSale(false);
    setPastSaleDate(new Date().toLocaleDateString("en-CA"));
    setManagerPasscode("");
    await onSaved();
    Alert.alert(
      "Sale completed",
      `Receipt ${saved?.receipt_number ?? ""}\n${peso(Number(saved?.total ?? total))} paid by ${payment === "cash" ? `Cash\nChange: ${peso(changeDue)}` : "GCash — received"}.`,
      [
        { text: "See sales today", onPress: () => onNavigate("dashboard") },
        { text: "Start next sale", onPress: () => onNavigate(eventMode ? "event_sale" : "sale") },
      ],
    );
  };
  if (review)
    return (
      <View style={s.flex}>
        <Back title="Review sale" onPress={() => setReview(false)} />
        <ScrollView contentContainerStyle={s.scroll}>
          <Step number="2">Check quantity, then choose payment.</Step>
          {cart.map((x) => {
            const key = cartKey(
              x.product.id,
              x.variant?.id,
              x.selectedLetters,
            );
            return (
              <View key={key} style={s.cartRow}>
                <View style={s.cartProductTop}>
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
                    <Text style={s.rowTitle} numberOfLines={2}>{x.product.name}</Text>
                    {x.variant ? (
                      <Text style={s.variantChosen} numberOfLines={1}>
                        {x.product.variant_label ?? "Choice"}: {x.variant.name}
                      </Text>
                    ) : null}
                    {x.selectedLetters.length ? (
                      <Text style={s.variantChosen} numberOfLines={1}>
                        {x.product.alphabet_style?.name ?? "Letters"}: {x.selectedLetters.join(" · ")}
                      </Text>
                    ) : null}
                    <Text style={s.rowHelp}>{peso(x.unitPrice)} each</Text>
                  </View>
                  <Text style={s.lineTotal}>
                    {peso(x.quantity * x.unitPrice)}
                  </Text>
                </View>
                <View style={s.cartProductBottom}>
                  <Text style={s.quantityLabel}>Quantity</Text>
                  <Quantity
                    value={x.quantity}
                    minus={() => change(key, -1)}
                    plus={() => change(key, 1)}
                  />
                </View>
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
              onPress={() => {
                setPayment("gcash");
                setCashReceived("");
              }}
            />
          </View>
          {payment === "cash" ? (
            <View style={s.cashCalculator}>
              <View style={s.gcashHeading}>
                <View style={s.cashIcon}>
                  <Ionicons name="cash-outline" size={27} color={C.accent} />
                </View>
                <View style={s.flex}>
                  <Text style={s.rowTitle}>Cash received</Text>
                  <Text style={s.rowHelp}>Enter how much the customer gave you.</Text>
                </View>
              </View>
              <TextInput
                accessibilityLabel="Cash received"
                style={s.cashInput}
                value={cashReceived}
                onChangeText={setCashReceived}
                placeholder="₱0"
                keyboardType="decimal-pad"
              />
              <View style={s.quickCashRow}>
                {[100, 200, 500, 1000].map((amount) => (
                  <Pressable key={amount} style={s.quickCash} onPress={() => setCashReceived(String(amount))}>
                    <Text style={s.quickCashText}>₱{amount}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={[s.changeBox, cashReceived.trim() !== "" && !cashIsEnough && s.changeBoxShort]}>
                <Text style={s.totalLabel}>
                  {cashReceived.trim() === ""
                    ? "Change to give"
                    : cashIsEnough
                      ? "CHANGE TO GIVE"
                      : "MORE CASH NEEDED"}
                </Text>
                <Text style={s.changeValue}>
                  {cashReceived.trim() === ""
                    ? "—"
                    : cashIsEnough
                      ? peso(changeDue)
                      : peso(Math.max(0, total - (Number.isFinite(cashAmount) ? cashAmount : 0)))}
                </Text>
              </View>
            </View>
          ) : null}
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
          <View style={s.pastSaleCard}>
            <Pressable style={s.pastSaleTop} onPress={() => setRecordPastSale((value) => !value)}>
              <View style={s.pastSaleIcon}><Ionicons name="calendar-outline" size={22} color={C.dark} /></View>
              <View style={s.flex}>
                <Text style={s.rowTitle}>Was this sale from an earlier day?</Text>
                <Text style={s.rowHelp}>Use this only when a sale was missed.</Text>
              </View>
              <Ionicons name={recordPastSale ? "checkmark-circle" : "ellipse-outline"} size={27} color={recordPastSale ? C.accent : C.muted} />
            </Pressable>
            {recordPastSale ? (
              <View style={s.pastSaleFields}>
                <Label>Original sale date</Label>
                <TextInput style={s.input} value={pastSaleDate} onChangeText={setPastSaleDate} placeholder="YYYY-MM-DD" maxLength={10} />
                <Label>Manager passcode</Label>
                <TextInput style={s.input} value={managerPasscode} onChangeText={setManagerPasscode} placeholder="4 to 8 numbers" keyboardType="number-pad" secureTextEntry maxLength={8} />
                <Text style={s.rowHelp}>The entry will show on this date and be labelled as entered later.</Text>
              </View>
            ) : null}
          </View>
          <BigButton
            label={
              saving
                ? "Saving sale…"
                : payment === "gcash" && !gcashReceived
                  ? "Confirm GCash payment above"
                  : payment === "cash" && !cashIsEnough
                    ? "Enter cash received"
                  : `${recordPastSale ? "Record past sale" : "Complete sale"} · ${peso(total)}`
            }
            icon="checkmark-circle-outline"
            onPress={complete}
            disabled={
              saving ||
              !cart.length ||
              (payment === "gcash" && !gcashReceived) ||
              (payment === "cash" && !cashIsEnough) ||
              (recordPastSale && (!/^\d{4}-\d{2}-\d{2}$/.test(pastSaleDate) || !/^\d{4,8}$/.test(managerPasscode)))
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
        key={`products-${productColumns}`}
        data={choosingCategory ? [] : filtered}
        numColumns={productColumns}
        keyExtractor={(p) => p.id}
        columnWrapperStyle={s.productRow}
        contentContainerStyle={[
          s.productList,
          count > 0 && s.productListBasket,
        ]}
        ListHeaderComponent={
          <>
            {startPastSale ? (
              <View style={s.missedBanner}>
                <Ionicons name="calendar" size={24} color={C.white} />
                <View style={s.flex}>
                  <Text style={s.missedBannerTitle}>Adding a missed sale</Text>
                  <Text style={s.missedBannerText}>Choose the products now. You will choose the original date before saving.</Text>
                </View>
              </View>
            ) : null}
            {eventMode ? (
              <View style={s.eventBanner}>
                <Ionicons name="flash" size={22} color={C.accent} />
                <View style={s.flex}><Text style={s.eventBannerTitle}>Event mode</Text><Text style={s.eventBannerText}>Fast checkout for markets and busy pop-ups.</Text></View>
              </View>
            ) : null}
            <Text style={s.pageTitle}>
              {choosingCategory ? "Choose a category" : "Choose a product"}
            </Text>
            <Step number="1">
              {choosingCategory
                ? "Tap the type of product the customer wants."
                : "Tap a product photo to add it."}
            </Step>
            <Search value={search} onChange={setSearch} />
            {choosingCategory ? (
              <View style={s.categoryGrid}>
                {categories.map((c) => {
                  const tone = categoryTone(c.name);
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${c.name}`}
                      key={c.id}
                      style={[
                        s.categoryCard,
                        {
                          backgroundColor: tone.soft,
                          borderColor: `${tone.color}26`,
                          width: width >= 980 ? "23.5%" : width >= 700 ? "31.8%" : "48%",
                          minHeight: width >= 700 ? 148 : 126,
                        },
                      ]}
                      onPress={() => setCategory(c.id)}
                    >
                      <View style={[s.categoryCardIcon, { backgroundColor: tone.color }]}>
                        <Ionicons name={categoryIcon(c.name)} size={28} color={C.white} />
                      </View>
                      <Text style={[s.categoryCardText, { color: tone.color }]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              width < 700 ? (
                <>
                  <Text style={s.stockFilterLabel}>Category</Text>
                  <Pressable style={s.stockCategoryPicker} onPress={() => setSaleCategoryOpen((open) => !open)}>
                    <View style={s.stockCategoryPickerIcon}>
                      <Ionicons name={category ? categoryIcon(categoryName(category)) : "apps"} size={21} color={C.accent} />
                    </View>
                    <Text style={s.stockCategoryPickerText} numberOfLines={1}>{category ? categoryName(category) : "All categories"}</Text>
                    <Text style={s.stockCategoryChange}>Change</Text>
                    <Ionicons name={saleCategoryOpen ? "chevron-up" : "chevron-down"} size={20} color={C.muted} />
                  </Pressable>
                  {saleCategoryOpen ? (
                    <View style={s.categoryMenu}>
                      <Pressable style={s.categoryMenuRow} onPress={() => { setCategory(null); setSearch(""); setSaleCategoryOpen(false); }}><Ionicons name="apps" size={20} color={C.ink}/><Text style={s.categoryMenuText}>All categories</Text></Pressable>
                      {categories.map((c) => (
                        <Pressable key={c.id} style={[s.categoryMenuRow,category===c.id&&s.categoryMenuRowOn]} onPress={() => { setCategory(c.id); setSaleCategoryOpen(false); }}><Ionicons name={categoryIcon(c.name)} size={20} color={categoryTone(c.name).color}/><Text style={s.categoryMenuText}>{c.name}</Text>{category===c.id?<Ionicons name="checkmark" size={20} color={C.accent}/>:null}</Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={s.desktopCategoryTabs}>
                  <Chip label="Categories" icon="grid" selected={false} onPress={() => { setCategory(null); setSearch(""); }} />
                  {categories.map((c) => (
                    <Chip key={c.id} label={c.name} icon={categoryIcon(c.name)} tone={categoryTone(c.name)} selected={category === c.id} onPress={() => setCategory(c.id)} />
                  ))}
                </View>
              )
            )}
          </>
        }
        ListEmptyComponent={choosingCategory ? null : <Empty title="Nothing here yet" />}
        renderItem={({ item }) => {
          const variantPrices = item.variants
            .map((variant) => variant.price_override)
            .filter((value): value is number => value !== null);
          const price =
            item.sale_price ??
            item.regular_price ??
            (variantPrices.length ? Math.min(...variantPrices) : null);
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
                { width: cardWidth },
                unavailable && s.disabled,
                qty > 0 && s.productOn,
              ]}
              onPress={() => add(item)}
            >
              <View
                style={[
                  s.productVisual,
                  { height: cardWidth - 18 },
                ]}
              >
                {item.image_url || placeholderImage(item.name) ? (
                  <Image
                    source={item.image_url ? { uri: item.image_url } : placeholderImage(item.name)}
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
                {item.sale_price !== null ? (
                  <View style={s.saleBadge}>
                    <Text style={s.saleBadgeText}>ON SALE</Text>
                  </View>
                ) : null}
                <View
                  style={[
                    s.stockBadge,
                    item.quantity_on_hand <= item.low_stock_threshold && s.stockBadgeLow,
                  ]}
                >
                  <Text style={s.stockBadgeText}>
                    {item.needs_stock_count
                      ? "? left"
                      : item.quantity_on_hand <= 0
                        ? "Out"
                        : `${item.quantity_on_hand} left`}
                  </Text>
                </View>
              </View>
              <Text style={s.productName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={s.productPrice}>
                {price === null
                  ? "No price"
                  : item.sale_price === null && item.regular_price === null && variantPrices.length
                    ? `From ${peso(price)}`
                    : peso(price)}
              </Text>
              {item.letters_required > 0 ? (
                <Text style={s.variantHint} numberOfLines={1}>
                  {item.letters_required} letter{item.letters_required === 1 ? "" : "s"}
                </Text>
              ) : item.variants.length ? (
                <Text style={s.variantHint} numberOfLines={1}>
                  {item.name === "Extra Alphabet"
                    ? "Design + letter"
                    : `Choose ${item.variant_label ?? "option"}`}
                </Text>
              ) : null}
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
                  {choosing?.name === "Extra Alphabet" && choosing.variants.some((variant) => variant.name.includes(" | "))
                    ? chosenDesign
                      ? "CHOOSE A LETTER"
                      : "CHOOSE A DESIGN"
                    : choosing?.letters_required
                    ? `CHOOSE ${choosing.letters_required} LETTER${choosing.letters_required === 1 ? "" : "S"}`
                    : `CHOOSE ${choosing?.variant_label?.toUpperCase() ?? "OPTION"}`}
                </Text>
                <Text style={s.variantTitle}>{choosing?.name}</Text>
                {choosing?.name === "Extra Alphabet" && chosenDesign ? (
                  <Pressable onPress={() => setChosenDesign(null)}>
                    <Text style={s.variantChosen}>← {chosenDesign} · choose A to Z</Text>
                  </Pressable>
                ) : null}
                {choosing?.letters_required ? (
                  <Text style={s.variantChosen}>
                    {choosing.alphabet_style?.name ?? "Alphabet"}: {chosenLetters.length ? chosenLetters.join(" · ") : "Tap letters below"}
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel="Close choices"
                style={s.guideClose}
                onPress={() => {
                  setChoosing(null);
                  setChosenLetters([]);
                  setChosenDesign(null);
                }}
              >
                <Ionicons name="close" size={24} color={C.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.variantGrid}>
              {choosing?.name === "Extra Alphabet" &&
              choosing.variants.some((variant) => variant.name.includes(" | "))
                ? chosenDesign
                  ? choosing.variants
                      .filter((variant) =>
                        variant.name.startsWith(`${chosenDesign} | `),
                      )
                      .map((variant) => {
                        const unavailable = variant.quantity_on_hand <= 0;
                        const letter = variant.name.split(" | ")[1];
                        return (
                          <Pressable
                            key={variant.id}
                            style={[s.variantButton, unavailable && s.disabled]}
                            disabled={unavailable}
                            onPress={() => add(choosing, variant)}
                          >
                            <Text style={s.variantButtonText}>{letter}</Text>
                            <Text style={[s.variantStock, unavailable && s.low]}>
                              {unavailable
                                ? "Out"
                                : `${variant.quantity_on_hand} left`}
                            </Text>
                          </Pressable>
                        );
                      })
                  : [
                      ...new Set(
                        choosing.variants.map(
                          (variant) => variant.name.split(" | ")[0],
                        ),
                      ),
                    ].map((design) => {
                      const designVariants = choosing.variants.filter((variant) =>
                        variant.name.startsWith(`${design} | `),
                      );
                      const price = designVariants.find(
                        (variant) => variant.price_override !== null,
                      )?.price_override;
                      const available = designVariants.reduce(
                        (sum, variant) => sum + variant.quantity_on_hand,
                        0,
                      );
                      return (
                        <Pressable
                          key={design}
                          style={[s.designButton, available <= 0 && s.disabled]}
                          disabled={available <= 0}
                          onPress={() => setChosenDesign(design)}
                        >
                          <Text style={s.designButtonText}>{design}</Text>
                          <Text style={s.designPrice}>
                            {price === null || price === undefined
                              ? "No price"
                              : peso(price)}
                          </Text>
                          <Text style={s.designStock}>{available} letters ready</Text>
                        </Pressable>
                      );
                    })
                : choosing?.letters_required
                ? choosing.alphabet_style?.letters.map((item) => {
                    const alreadyChosen = chosenLetters.filter(
                      (letter) => letter === item.letter,
                    ).length;
                    const selected = alreadyChosen > 0;
                    const unavailable =
                      item.needs_stock_count ||
                      item.quantity_on_hand <= alreadyChosen ||
                      chosenLetters.length >= choosing.letters_required;
                    return (
                      <Pressable
                        key={item.letter}
                        style={[
                          s.variantButton,
                          selected && s.variantButtonOn,
                          unavailable && !selected && s.disabled,
                        ]}
                        onPress={() => {
                          if (!unavailable)
                            setChosenLetters((old) => [...old, item.letter]);
                        }}
                      >
                        <Text style={[s.variantButtonText, selected && s.variantButtonTextOn]}>{item.letter}</Text>
                        <Text style={[s.variantStock, selected && s.variantStockOn, unavailable && !selected && s.low]}>
                          {selected
                            ? `Selected ×${alreadyChosen}`
                            : item.needs_stock_count
                            ? "? left"
                            : `${item.quantity_on_hand} left`}
                        </Text>
                        {selected ? (
                          <Pressable
                            accessibilityLabel={`Remove one ${item.letter}`}
                            style={s.variantRemove}
                            onPress={(event) => {
                              event.stopPropagation();
                              setChosenLetters((old) => {
                                const index = old.lastIndexOf(item.letter);
                                return index < 0
                                  ? old
                                  : [...old.slice(0, index), ...old.slice(index + 1)];
                              });
                            }}
                          >
                            <Ionicons name="remove" size={15} color={C.green} />
                          </Pressable>
                        ) : null}
                      </Pressable>
                    );
                  })
                : choosing?.variants.map((variant) => {
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
            {choosing?.letters_required ? (
              <View style={s.letterFooter}>
                <Text style={s.letterCount}>
                  {chosenLetters.length} of {choosing.letters_required} selected
                </Text>
                <Pressable
                  style={[s.letterAddButton, chosenLetters.length !== choosing.letters_required && s.disabled]}
                  disabled={chosenLetters.length !== choosing.letters_required}
                  onPress={() => add(choosing, null, chosenLetters)}
                >
                  <Ionicons name="cart-outline" size={24} color={C.white} />
                  <Text style={s.letterAddText}>Add to sale</Text>
                </Pressable>
              </View>
            ) : null}
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

function QuickStart({ locationId, onOpen }: { locationId: string; onOpen: (screen: Screen) => void }) {
  const { width } = useWindowDimensions();
  const [orderSummary, setOrderSummary] = useState({ active: 0, urgent: 0 });
  useEffect(() => {
    supabase
      .from("external_orders")
      .select("status,target_date")
      .eq("location_id", locationId)
      .then(({ data }) => {
        const active = (data ?? []).filter((o) => !["completed", "cancelled"].includes(o.status)).length;
        const todayValue = new Date().toLocaleDateString("en-CA");
        const urgent = (data ?? []).filter((o) => !["completed", "cancelled"].includes(o.status) && o.target_date && o.target_date <= todayValue).length;
        setOrderSummary({ active, urgent });
      });
  }, [locationId]);
  const actions: Array<{
    title: string;
    help: string;
    icon: Icon;
    screen: Screen;
    color: string;
    soft: string;
  }> = [
    { title: "Sell", help: "Shop, event or earlier sale", icon: "cart", screen: "sell_start", color: C.green, soft: "#EEF2F6" },
    { title: "Orders", help: orderSummary.active ? `${orderSummary.active} active${orderSummary.urgent ? ` · ${orderSummary.urgent} due` : ""}` : "Customer orders", icon: "clipboard", screen: "orders", color: C.purple, soft: C.purpleSoft },
    { title: "Stock", help: "Check or update stock", icon: "cube", screen: "inventory", color: C.teal, soft: C.tealSoft },
    { title: "Sales", help: "Today's sales", icon: "today", screen: "dashboard", color: C.accent, soft: C.accentSoft },
    { title: "Production", help: "Printers and filament", icon: "construct", screen: "production", color: "#087A38", soft: "#EEF7F1" },
    { title: "More", help: "Prices, reports and settings", icon: "grid", screen: "more", color: "#4B5158", soft: "#F1F2F3" },
  ];
  return (
    <ScrollView contentContainerStyle={s.quickScroll}>
      <Text style={s.pageTitle}>What would you like to do?</Text>
      <Text style={s.subtitle}>Tap one option.</Text>
      <View style={s.quickGrid}>
        {actions.map((action) => (
          <Pressable
            key={action.title}
            accessibilityRole="button"
            accessibilityLabel={`${action.title}. ${action.help}`}
            style={({ pressed }) => [s.quickCard, { backgroundColor: action.soft, width: width >= 920 ? "31.8%" : "48%" }, pressed && { opacity: 0.82, transform: [{ scale: .985 }] }]}
            onPress={() => onOpen(action.screen)}
          >
            <View style={[s.quickIcon,{backgroundColor:action.color}]}>
              <Ionicons name={action.icon} size={28} color={C.white} />
            </View>
            <Text style={s.quickTitle}>{action.title}</Text>
            <Text style={s.quickHelp}>{action.help}</Text>
            <View style={s.quickGo}>
              <Text style={[s.quickGoText,{color:action.color}]}>Open</Text>
              <Ionicons name="arrow-forward" size={18} color={action.color} />
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
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
        : item.selected_letters?.length
          ? `${item.product_name} · ${item.selected_letters.join("")}`
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
                  {item.selected_letters?.length
                    ? ` · ${item.selected_letters.join("")}`
                    : ""}
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
  const [extraAlphabetMode, setExtraAlphabetMode] = useState(false);
  const [designPrices, setDesignPrices] = useState("Normal: 20\nSuperman: 50");
  const [choiceLabel, setChoiceLabel] = useState("Letter");
  const [choiceText, setChoiceText] = useState("");
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState("image/jpeg");
  const [saving, setSaving] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);
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
    setExtraAlphabetMode(false);
    setDesignPrices("Normal: 20\nSuperman: 50");
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
  const startExtraAlphabet = () => {
    reset();
    setCreating(true);
    setName("Extra Alphabet");
    setCategoryId(
      categories.find((item) => item.name === "Keyboard Clickers")?.id ??
        categories[0]?.id ??
        null,
    );
    setHasChoices(true);
    setExtraAlphabetMode(true);
    setChoiceLabel("Design and letter");
    setChoiceText("");
    setDesignPrices("Normal: 20\nSuperman: 50");
    setStartingStock("0");
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
      quality: 1,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          asset.width >= asset.height
            ? { resize: { width: 1000 } }
            : { resize: { height: 1000 } },
        ],
        { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG },
      );
      setPickedUri(resized.uri);
      setPickedMime("image/jpeg");
    }
  };
  const uploadImage = async (productId: string, uri: string) => {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Photo could not be read");
    const bytes = await response.arrayBuffer();
    const path = `${businessId}/${productId}/main.jpg`;
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
  const extraAlphabetDesigns = () =>
    designPrices
      .split(/\n/)
      .map((line) => {
        const match = line.match(/^\s*(.+?)\s*:\s*(\d+(?:\.\d+)?)\s*$/);
        return match ? { name: match[1].trim(), price: Number(match[2]) } : null;
      })
      .filter((item): item is { name: string; price: number } => Boolean(item));
  const useAlphabet = () => {
    setHasChoices(true);
    setChoiceLabel("Letter");
    setChoiceText(
      Array.from({ length: 26 }, (_, index) =>
        String.fromCharCode(65 + index),
      ).join(", "),
    );
  };
  const saveCategory = async () => {
    const clean = categoryName.trim();
    if (!clean) return Alert.alert("Enter a category name");
    setCategoryBusy(true);
    const result = editingCategory
      ? await supabase.from("categories").update({ name: clean }).eq("id", editingCategory.id)
      : await supabase.from("categories").insert({ business_id: businessId, name: clean });
    setCategoryBusy(false);
    if (result.error) return Alert.alert("Category not saved", result.error.message);
    setCategoryName("");
    setEditingCategory(null);
    await onSaved();
  };
  const deleteCategory = (item: Category) =>
    Alert.alert("Remove this category?", `Products in ${item.name} will remain available and can be moved to another category.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Remove category", style: "destructive", onPress: async () => {
        const { error } = await supabase.from("categories").update({ active: false }).eq("id", item.id);
        if (error) return Alert.alert("Category not removed", error.message);
        if (categoryId === item.id) setCategoryId(null);
        await onSaved();
      } },
    ]);
  const save = async () => {
    const cleanName = name.trim();
    const prices = numbers();
    if (!cleanName) return Alert.alert("Enter a product name");
    if (!prices)
      return Alert.alert(
        "Check the price",
        "Enter a valid price or leave the sale price empty.",
      );
    if (extraAlphabetMode) {
      const designs = extraAlphabetDesigns();
      if (!designs.length || designs.some((design) => design.price < 20 || design.price > 50))
        return Alert.alert(
          "Check the design prices",
          "Use one line per design, such as Normal: 20 or Superman: 50. Each price must be from ₱20 to ₱50.",
        );
    }
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
      const designs = extraAlphabetMode ? extraAlphabetDesigns() : [];
      const variantSetup = extraAlphabetMode
        ? designs.flatMap((design) =>
            Array.from({ length: 26 }, (_, index) => ({
              name: `${design.name} | ${String.fromCharCode(65 + index)}`,
              price: design.price,
            })),
          )
        : hasChoices
          ? choiceNames().map((variantName) => ({ name: variantName, price: null }))
          : [];
      if (hasChoices && !choiceLabel.trim()) {
        setSaving(false);
        return Alert.alert(
          "Name the choice",
          "Example: Letter, Colour, or Size.",
        );
      }
      if (hasChoices && variantSetup.length < 2) {
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
          p_variants: variantSetup.map((variant) => ({ name: variant.name })),
        },
      );
      if (error || !createdId) {
        setSaving(false);
        return Alert.alert(
          "Product not created",
          error?.message ?? "Please try again.",
        );
      }
      if (extraAlphabetMode) {
        const { data: createdVariants } = await supabase
          .from("product_variants")
          .select("id,name")
          .eq("product_id", createdId);
        for (const createdVariant of createdVariants ?? []) {
          const configured = variantSetup.find(
            (variant) => variant.name === createdVariant.name,
          );
          if (configured?.price !== null && configured?.price !== undefined)
            await supabase
              .from("product_variants")
              .update({ price_override: configured.price })
              .eq("id", createdVariant.id);
        }
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
    const placeholder = selected ? placeholderImage(selected.name) : null;
    return (
      <ScrollView contentContainerStyle={s.scroll}>
        <Back
          title={creating ? "New product" : "Edit product"}
          onPress={reset}
        />
        <View style={s.editCard}>
          <View style={s.productPhoto}>
            {image || placeholder ? (
              <Image source={image ? { uri: image } : placeholder} style={s.productPhotoImage} />
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
          <Pressable style={s.manageCategoryButton} onPress={() => setManagingCategories(true)}>
            <Ionicons name="settings-outline" size={20} color={C.dark} />
            <Text style={s.manageCategoryText}>Add or manage categories</Text>
          </Pressable>
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
                tone={categoryTone(c.name)}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>
          {extraAlphabetMode ? (
            <View style={s.choiceSetup}>
              <Text style={s.rowTitle}>Design prices</Text>
              <Text style={s.rowHelp}>One design and price per line. Every design automatically receives A to Z.</Text>
              <TextInput
                style={[s.input, s.choiceInput]}
                value={designPrices}
                onChangeText={setDesignPrices}
                placeholder={"Normal: 20\nSuperman: 50"}
                multiline
              />
            </View>
          ) : (
            <>
              <Label>Normal price</Label>
              <TextInput style={s.priceInput} keyboardType="decimal-pad" value={regular} onChangeText={setRegular} placeholder="0.00" />
              <Label>Sale price (optional)</Label>
              <TextInput style={s.priceInput} keyboardType="decimal-pad" value={sale} onChangeText={setSale} placeholder="Leave empty when not on sale" />
            </>
          )}
          {creating && !extraAlphabetMode ? (
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
          ) : !creating && hasChoices ? (
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
  if (managingCategories) {
    return (
      <ScrollView contentContainerStyle={s.scroll}>
        <Back title="Product categories" onPress={() => { setManagingCategories(false); setEditingCategory(null); setCategoryName(""); }} />
        <View style={s.editCard}>
          <Text style={s.rowTitle}>{editingCategory ? "Rename category" : "Add a category"}</Text>
          <TextInput style={s.input} value={categoryName} onChangeText={setCategoryName} placeholder="Example: Keychains" />
          <BigButton label={categoryBusy ? "Saving…" : editingCategory ? "Save category name" : "Add category"} icon="add-circle-outline" onPress={saveCategory} disabled={categoryBusy} />
          {editingCategory ? <Pressable style={s.cancelCategory} onPress={() => { setEditingCategory(null); setCategoryName(""); }}><Text style={s.cancelCategoryText}>Cancel rename</Text></Pressable> : null}
        </View>
        <Text style={[s.rowTitle, { marginTop: 20 }]}>Current categories</Text>
        {categories.map((item) => (
          <View key={item.id} style={s.categoryManageRow}>
            <View style={[s.categoryManageIcon, { backgroundColor: categoryTone(item.name).soft }]}><Ionicons name={categoryIcon(item.name)} size={22} color={categoryTone(item.name).color} /></View>
            <Text style={[s.rowTitle, s.flex]}>{item.name}</Text>
            <Pressable accessibilityLabel={`Rename ${item.name}`} style={s.smallAction} onPress={() => { setEditingCategory(item); setCategoryName(item.name); }}><Ionicons name="pencil-outline" size={21} color={C.dark} /></Pressable>
            <Pressable accessibilityLabel={`Remove ${item.name}`} style={[s.smallAction, s.smallActionDanger]} onPress={() => deleteCategory(item)}><Ionicons name="trash-outline" size={21} color={C.red} /></Pressable>
          </View>
        ))}
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
      <Pressable style={s.manageCategoryButton} onPress={startExtraAlphabet}>
        <Ionicons name="text-outline" size={20} color={C.dark} />
        <View style={s.flex}>
          <Text style={s.manageCategoryText}>Set up Extra Alphabet</Text>
          <Text style={s.rowHelp}>Each design gets A–Z and its own ₱20–₱50 price</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={C.muted} />
      </Pressable>
      <Pressable style={s.manageCategoryButton} onPress={() => setManagingCategories(true)}>
        <Ionicons name="albums-outline" size={20} color={C.dark} />
        <Text style={s.manageCategoryText}>Add, rename or remove categories</Text>
      </Pressable>
      <Search value={search} onChange={setSearch} />
      <FlatList
        data={products.filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase()),
        )}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <Pressable style={s.listRow} onPress={() => open(item)}>
            {item.image_url || placeholderImage(item.name) ? (
              <Image source={item.image_url ? { uri: item.image_url } : placeholderImage(item.name)} style={s.listImage} />
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
  onHome,
}: {
  products: Product[];
  categories: Category[];
  locationId: string;
  onSaved: () => void;
  onHome: () => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [stockView, setStockView] = useState<"all" | "lowest" | "out">("all");
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [mode, setMode] = useState<"stock_in" | "damage">("stock_in");
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Other";
  const filtered = products
    .filter(
      (p) =>
        (!category || p.category_id === category) &&
        p.name.toLowerCase().includes(search.toLowerCase()) &&
        (stockView !== "out" || p.quantity_on_hand <= 0),
    )
    .sort((a, b) =>
      stockView === "lowest"
        ? a.quantity_on_hand - b.quantity_on_hand || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const save = async () => {
    const amount = Number(quantity);
    if (!selected || !Number.isInteger(amount) || amount <= 0)
      return Alert.alert(
        "Check quantity",
        "Enter a whole number greater than zero.",
      );
    let error: { message: string } | null = null;
    if (selectedLetter && selected.alphabet_style) {
      const letterResult = await supabase.rpc("record_alphabet_inventory_movement", {
          p_location_id: locationId,
          p_style_id: selected.alphabet_style.id,
          p_letter: selectedLetter,
          p_type: mode,
          p_quantity: amount,
          p_note: mode === "damage" ? "Damaged alphabet letter" : "Alphabet stock added",
        });
      error = letterResult.error;
      if (!error && selected.name.startsWith("Extra Alphabet -")) {
        const totalResult = await supabase.rpc("record_inventory_movement", {
          p_location_id: locationId,
          p_product_id: selected.id,
          p_type: mode,
          p_quantity: amount,
          p_note: mode === "damage" ? "Damaged alphabet total" : "Alphabet total stock added",
        });
        error = totalResult.error;
      }
    } else if (selectedVariant) {
      const variantResult = await supabase.rpc("record_variant_inventory_movement", {
          p_location_id: locationId,
          p_variant_id: selectedVariant.id,
          p_type: mode,
          p_quantity: amount,
          p_note:
            mode === "damage" ? "Damaged product choice" : "Choice stock added",
        });
      error = variantResult.error;
    } else {
      const productResult = await supabase.rpc("record_inventory_movement", {
          p_location_id: locationId,
          p_product_id: selected.id,
          p_type: mode,
          p_quantity: amount,
          p_note: mode === "damage" ? "Damaged product" : "Stock added",
        });
      error = productResult.error;
    }
    if (error) return Alert.alert("Stock not saved", error.message);
    setSelected(null);
    setSelectedVariant(null);
    setSelectedLetter(null);
    setQuantity("");
    await onSaved();
    Alert.alert(
      "Stock updated",
      mode === "damage"
        ? `${amount} damaged recorded.`
        : `${amount} added to stock.`,
      [
        { text: "Go home", onPress: onHome },
        { text: "Update more stock" },
      ],
    );
  };
  if (
    selected?.name.startsWith("Extra Alphabet -") &&
    selected.alphabet_style &&
    !selectedLetter
  )
    return (
      <View style={s.flex}>
        <Back title={`Choose ${selected.alphabet_style.name} letter`} onPress={() => setSelected(null)} />
        <FlatList
          data={selected.alphabet_style.letters}
          keyExtractor={(item) => item.letter}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <Pressable style={s.listRow} onPress={() => setSelectedLetter(item.letter)}>
              <View style={s.variantLetter}><Text style={s.variantLetterText}>{item.letter}</Text></View>
              <View style={s.flex}>
                <Text style={s.rowTitle}>Letter {item.letter}</Text>
                <Text style={s.rowHelp}>{item.needs_stock_count ? "Stock count needed" : `${item.quantity_on_hand} currently in stock`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={C.teal} />
            </Pressable>
          )}
        />
      </View>
    );
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
            else if (selectedLetter) setSelectedLetter(null);
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
              ) : selectedLetter ? (
                <Text style={s.variantChosen}>
                  {selected.alphabet_style?.name} letter {selectedLetter}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={s.stockBig}>
            {selectedLetter
              ? (selected.alphabet_style?.letters.find((item) => item.letter === selectedLetter)?.quantity_on_hand ?? 0)
              : (selectedVariant?.quantity_on_hand ?? selected.quantity_on_hand)}
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
      <Text style={s.subtitle}>Choose a product to update its stock.</Text>
      <Search value={search} onChange={setSearch} />
      <View style={s.stockFilters}>
      <Text style={s.stockFilterLabel}>Category</Text>
      <Pressable style={s.stockCategoryPicker} onPress={() => setCategoryOpen((open) => !open)}>
        <View style={s.stockCategoryPickerIcon}>
          <Ionicons
            name={category ? categoryIcon(categoryName(category)) : "apps"}
            size={21}
            color={C.accent}
          />
        </View>
        <Text style={s.stockCategoryPickerText} numberOfLines={1}>
          {category ? categoryName(category) : "All products"}
        </Text>
        <Text style={s.stockCategoryChange}>Change</Text>
        <Ionicons name={categoryOpen ? "chevron-up" : "chevron-down"} size={20} color={C.muted} />
      </Pressable>
      {categoryOpen ? (
        <View style={s.categoryMenu}>
          <Pressable style={[s.categoryMenuRow,!category&&s.categoryMenuRowOn]} onPress={() => { setCategory(null); setCategoryOpen(false); }}><Ionicons name="apps" size={20} color={C.ink}/><Text style={s.categoryMenuText}>All products</Text>{!category?<Ionicons name="checkmark" size={20} color={C.accent}/>:null}</Pressable>
          {categories.map((c) => (
            <Pressable key={c.id} style={[s.categoryMenuRow,category===c.id&&s.categoryMenuRowOn]} onPress={() => { setCategory(c.id); setCategoryOpen(false); }}><Ionicons name={categoryIcon(c.name)} size={20} color={categoryTone(c.name).color}/><Text style={s.categoryMenuText}>{c.name}</Text>{category===c.id?<Ionicons name="checkmark" size={20} color={C.accent}/>:null}</Pressable>
          ))}
        </View>
      ) : null}
      <Text style={s.stockFilterLabel}>Show stock by</Text>
      <View style={s.stockSortRow}>
        <Chip
          label="All"
          icon="list"
          selected={stockView === "all"}
          onPress={() => setStockView("all")}
        />
        <Chip
          label="Lowest"
          icon="arrow-down"
          selected={stockView === "lowest"}
          onPress={() => setStockView("lowest")}
        />
        <Chip
          label="Zero"
          icon="alert-circle"
          selected={stockView === "out"}
          onPress={() => setStockView("out")}
        />
      </View>
      </View>
      <Text style={s.stockResultCount}>
        {filtered.length} {filtered.length === 1 ? "product" : "products"}
      </Text>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const low = item.quantity_on_hand <= item.low_stock_threshold;
          const tone = categoryTone(categoryName(item.category_id));
          return (
            <Pressable
              style={[s.listRow, { backgroundColor: C.white, borderLeftColor: tone.color, borderLeftWidth: 4 }]}
              onPress={() => setSelected(item)}
            >
              {item.image_url || placeholderImage(item.name) ? (
                <Image source={item.image_url ? { uri: item.image_url } : placeholderImage(item.name)} style={s.stockListImage} />
              ) : <View style={s.listIcon}>
                <Ionicons
                  name={productIcon(item.name, categoryName(item.category_id))}
                  size={24}
                  color={low ? C.orange : C.accent}
                />
              </View>}
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
                <Text style={[s.stockNumLabel, low && s.low]}>left</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color={C.muted} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function PriceList({products,categories,business,onBack,onEdit}:{products:Product[];categories:Category[];business:Business;onBack:()=>void;onEdit:()=>void}) {
  const grouped=categories.map(category=>({category,items:products.filter(product=>product.category_id===category.id)})).filter(group=>group.items.length);
  const missing=products.filter(product=>product.sale_price===null&&product.regular_price===null).length;
  const printList=()=>{
    if(Platform.OS!=="web") return Alert.alert("Open on a computer","Use Mik on a computer to print the shop price list.");
    const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]!));
    const sections=grouped.map(group=>`<section><h2>${escape(group.category.name)}</h2>${group.items.map(product=>`<div class="row"><span>${escape(product.name)}</span><strong>${(product.sale_price??product.regular_price)!==null?escape(peso(Number(product.sale_price??product.regular_price))):"Price needed"}</strong></div>`).join("")}</section>`).join("");
    const popup=window.open("","_blank","width=900,height=900");
    if(!popup)return Alert.alert("Allow pop-ups","Allow pop-ups for Mik, then try Print price list again.");
    popup.document.write(`<!doctype html><html><head><title>${escape(business.name)} Price List</title><style>body{font-family:Arial,sans-serif;color:#101318;max-width:820px;margin:0 auto;padding:40px}header{border-bottom:3px solid #142C47;padding-bottom:20px;margin-bottom:25px}h1{font-size:34px;margin:0}p{color:#626A73}h2{font-size:18px;margin:25px 0 8px;color:#264A3B}.row{display:flex;justify-content:space-between;gap:25px;padding:10px 0;border-bottom:1px solid #E0E3E7}.row strong{white-space:nowrap}@media print{body{padding:0}}</style></head><body><header><h1>${escape(business.name)}</h1><p>Price List</p></header>${sections}</body></html>`);
    popup.document.close();popup.focus();popup.print();
  };
  return <ScrollView contentContainerStyle={s.scroll}><Back title="Price list" onPress={onBack}/><View style={s.priceListHero}><View style={s.flex}><Text style={s.priceListKicker}>POP-UP DISPLAY</Text><Text style={s.priceListTitle}>Current selling prices</Text><Text style={s.priceListHelp}>Sale prices are shown automatically when available.</Text></View><Ionicons name="receipt-outline" size={38} color={C.accent}/></View>{missing?<View style={s.priceWarning}><Ionicons name="alert-circle-outline" size={21} color={C.orange}/><Text style={s.priceWarningText}>{missing} {missing===1?"product needs":"products need"} a price before printing.</Text></View>:null}<View style={s.priceActions}><Pressable style={s.pricePrimary} onPress={printList}><Ionicons name="print-outline" size={21} color={C.white}/><Text style={s.pricePrimaryText}>Print price list</Text></Pressable><Pressable style={s.priceSecondary} onPress={onEdit}><Ionicons name="create-outline" size={21} color={C.dark}/><Text style={s.priceSecondaryText}>Edit prices</Text></Pressable></View>{grouped.map(group=><View key={group.category.id} style={s.priceSection}><View style={[s.priceSectionMark,{backgroundColor:categoryTone(group.category.name).color}]}/><Text style={s.priceSectionTitle}>{group.category.name}</Text>{group.items.map(product=><View key={product.id} style={s.priceRow}><Text style={s.priceName}>{product.name}</Text><View style={s.priceRight}>{product.sale_price!==null?<Text style={s.priceSaleTag}>SALE</Text>:null}<Text style={[s.priceValue,product.sale_price===null&&product.regular_price===null&&s.priceMissing]}>{product.sale_price!==null||product.regular_price!==null?peso(Number(product.sale_price??product.regular_price)):"Price needed"}</Text></View></View>)}</View>)}</ScrollView>;
}

function More({
  profile,
  business,
  onOpen,
  onGuide,
}: {
  profile: Profile | null;
  business: Business;
  onOpen: (x: Screen) => void;
  onGuide: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.pageTitle}>More</Text>
      <Text style={s.subtitle}>Simple tools for this shop.</Text>
      <Menu
        icon="storefront-outline"
        title="Shop profile & logo"
        help={business.logo_url ? "Replace this shop's logo" : "Add this shop's logo"}
        color={C.muted}
        soft="#F1F2F3"
        onPress={() => onOpen("shop")}
      />
      <Menu
        icon="pricetags-outline"
        title="Products & prices"
        help="View products and change prices"
        color={C.muted}
        soft="#F1F2F3"
        onPress={() => onOpen("products")}
      />
      <Menu icon="receipt-outline" title="Price list" help="View, print or check selling prices" color={C.muted} soft="#F1F2F3" onPress={() => onOpen("price_list")} />
      <Menu icon="hardware-chip-outline" title="Printers" help="See which printers are working" color={C.muted} soft="#F1F2F3" onPress={() => onOpen("printers")} />
      <Menu icon="color-filter-outline" title="Filaments" help="Track materials, colours and spools" color={C.muted} soft="#F1F2F3" onPress={() => onOpen("filaments")} />
      <Menu
        icon="bar-chart-outline"
        title="Sales reports"
        help="Daily, weekly or monthly reports"
        color={C.muted}
        soft="#F1F2F3"
        onPress={() => onOpen("reports")}
      />
      <Menu icon="return-up-back-outline" title="Correct a sale" help="Cancel a wrong sale and restore stock" color={C.muted} soft="#F1F2F3" onPress={() => onOpen("correct")} />
      <Menu icon="calendar-outline" title="Add an earlier sale" help="Record products sold on another day" color={C.muted} soft="#F1F2F3" onPress={() => onOpen("missed")} />
      <Menu
        icon="help-circle-outline"
        title="How to use Mik"
        help="Replay the simple step-by-step guide"
        color={C.muted}
        soft="#F1F2F3"
        onPress={onGuide}
      />
      <Text style={s.section}>Shop login</Text>
      <View style={s.account}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {((profile?.display_name ?? "S").toLowerCase().includes("sebu") ? "P" : (profile?.display_name ?? "S")[0]).toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={s.rowTitle}>
            {(profile?.display_name ?? "Shop user").toLowerCase().includes("sebu")
              ? "Pixelbug"
              : profile?.display_name ?? "Shop user"}
          </Text>
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

function ShopProfile({
  business,
  onBack,
  onSaved,
}: {
  business: Business;
  onBack: () => void;
  onSaved: (logoUrl: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const chooseLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return Alert.alert("Photo access needed", "Allow Mik to choose a shop logo from this device.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled) return;
    setSaving(true);
    try {
      const asset = result.assets[0];
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [asset.width >= asset.height ? { resize: { width: 900 } } : { resize: { height: 900 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
      );
      const response = await fetch(resized.uri);
      if (!response.ok) throw new Error("Logo could not be read");
      const path = `${business.id}/shop/logo.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, await response.arrayBuffer(), { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;
      const logo_url = `${supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      const { error: saveError } = await supabase.from("businesses").update({ logo_url }).eq("id", business.id);
      if (saveError) throw saveError;
      onSaved(logo_url);
      Alert.alert("Shop logo updated", "The new logo now appears in this shop's header.");
    } catch (error: any) {
      Alert.alert("Logo not saved", error?.message ?? "Please try another image.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Back title="Shop profile" onPress={onBack} />
      <Text style={s.subtitle}>This logo belongs only to {business.name}.</Text>
      <View style={s.editCard}>
        <View style={s.shopLogoPreview}>
          <Image
            source={business.logo_url ? { uri: business.logo_url } : require("../assets/mik-app-icon.png")}
            style={s.shopLogoPreviewImage}
          />
        </View>
        <Text style={s.shopProfileName}>{business.name}</Text>
        <Text style={s.centerHelp}>Choose a clear square logo. Mik will resize it automatically.</Text>
        <BigButton
          label={saving ? "Saving logo…" : business.logo_url ? "Replace shop logo" : "Upload shop logo"}
          icon="image-outline"
          onPress={chooseLogo}
          disabled={saving}
        />
      </View>
    </ScrollView>
  );
}

type GuideFlow = { icon: Icon; label: string };
type GuideStep = { title: string; body: string; icon: Icon; flow: GuideFlow[] };
const guideSteps: GuideStep[] = [
  {
    title: "Welcome to Mik",
    body: "Home has six simple choices. Tap Home at any time to come back.",
    icon: "home",
    flow: [
      { icon: "home-outline", label: "Home" },
      { icon: "cart-outline", label: "Sell" },
      { icon: "today-outline", label: "Today" },
      { icon: "cube-outline", label: "Stock" },
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
    body: "Tap Stock, choose a product, then add stock or record damaged stock. Mik asks for a letter, colour, or size when needed.",
    icon: "cube",
    flow: [
      { icon: "cube-outline", label: "Stock" },
      { icon: "image-outline", label: "Product" },
      { icon: "add-circle-outline", label: "Add stock" },
    ],
  },
  {
    title: "Track outside orders",
    body: "Tap Orders for Facebook, online, referral, or walk-in work. Record where the customer paid, then update the order as work progresses.",
    icon: "clipboard",
    flow: [
      { icon: "clipboard-outline", label: "Orders" },
      { icon: "card-outline", label: "Payment" },
      { icon: "construct-outline", label: "Making" },
      { icon: "checkmark-circle-outline", label: "Ready" },
    ],
  },
  {
    title: "Correct or add a missed sale",
    body: "Tap Sell to add an earlier sale. To cancel a wrong sale, open More, then Correct a sale. A manager passcode protects both actions.",
    icon: "return-up-back",
    flow: [
      { icon: "home-outline", label: "Home" },
      { icon: "return-up-back-outline", label: "Correct" },
      { icon: "calendar-outline", label: "Missed sale" },
    ],
  },
  {
    title: "Create or edit a product",
    body: "Open More, then Products & prices. Add a photo, price, and stock. Turn on choices only when a product needs letters, colours, or sizes.",
    icon: "pricetags",
    flow: [
      { icon: "home-outline", label: "Home" },
      { icon: "pricetags-outline", label: "Products" },
      { icon: "camera-outline", label: "Photo" },
      { icon: "save-outline", label: "Save" },
    ],
  },
  {
    title: "View sales reports",
    body: "Open More, then Sales reports. Choose a day, week, month, or exact date.",
    icon: "bar-chart",
    flow: [
      { icon: "home-outline", label: "Home" },
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
  tone,
}: {
  label: string;
  icon?: Icon;
  selected: boolean;
  onPress: () => void;
  tone?: { color: string; soft: string };
}) {
  const chipTone = tone ?? { color: C.accent, soft: C.white };
  return (
    <Pressable
      style={[
        s.chip,
        { borderColor: chipTone.color, backgroundColor: selected ? chipTone.color : chipTone.soft },
      ]}
      onPress={onPress}
    >
      {icon ? (
        <Ionicons name={icon} size={19} color={selected ? C.white : chipTone.color} />
      ) : null}
      <Text style={[s.chipText, { color: selected ? C.white : chipTone.color }]}>{label}</Text>
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
    padding: 18,
    backgroundColor: C.cream,
  },
  loginShell:{width:"100%",maxWidth:1040,overflow:"hidden",borderWidth:1,borderColor:C.border,borderRadius:20,backgroundColor:C.white,shadowColor:"#071521",shadowOpacity:.09,shadowRadius:28,shadowOffset:{width:0,height:14},elevation:8},
  loginShellWide:{minHeight:650,flexDirection:"row"},
  loginEditorial:{width:"52%",padding:56,justifyContent:"center",backgroundColor:C.dark},
  loginKicker:{color:"#C7D1DA",fontSize:11,fontWeight:"700",letterSpacing:2.1},
  loginEditorialTitle:{maxWidth:430,marginTop:24,color:C.white,fontSize:48,lineHeight:55,fontWeight:"700",letterSpacing:-1.7},
  loginEditorialBody:{maxWidth:410,marginTop:20,color:"#D7DEE5",fontSize:18,lineHeight:28},
  loginEditorialRule:{width:48,height:2,marginTop:38,backgroundColor:C.white},
  loginEditorialQuote:{marginTop:16,color:C.white,fontSize:14,fontWeight:"700",letterSpacing:.2},
  loginCard: {
    width: "100%",
    maxWidth: 520,
    padding: 28,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  loginCardWide:{width:"48%",justifyContent:"center",paddingHorizontal:52,borderWidth:0},
  brandLogo: { width: 96, height: 96, alignSelf: "center" },
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
    fontWeight: "700",
    letterSpacing: 3,
  },
  loginTitle: {
    marginTop: 4,
    color: C.ink,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
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
    fontWeight: "700",
  },
  input: {
    minHeight: 56,
    paddingHorizontal: 17,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
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
    fontWeight: "700",
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
  guidePreviewText: { color: C.dark, fontSize: 15, fontWeight: "700" },
  loginCredit: {
    marginTop: 14,
    paddingHorizontal: 20,
    color: "#A8ADB2",
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  top: {
    minHeight: 60,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  shopLogo: { width: 42, height: 42, borderRadius: 13 },
  shopLogoPreview: {
    width: 180,
    height: 180,
    alignSelf: "center",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    backgroundColor: C.white,
  },
  shopLogoPreviewImage: { width: "100%", height: "100%", resizeMode: "contain" },
  shopProfileName: { marginTop: 18, color: C.ink, fontSize: 25, fontWeight: "700", textAlign: "center" },
  shopIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.soft,
  },
  shopName: { color: C.ink, fontSize: 17, fontWeight: "700" },
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
  readyText: { color: C.accentDark, fontSize: 12, fontWeight: "700" },
  locationBar: {
    minHeight: 56,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.white,
  },
  locationLabel: { color: C.muted, fontSize: 14, fontWeight: "700" },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  workspace:{flex:1},
  desktopWorkspace:{flexDirection:"column-reverse"},
  desktopContent:{paddingHorizontal:28},
  nav: {
    minHeight: 76,
    paddingHorizontal: 8,
    paddingBottom: 4,
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
  },
  desktopNav:{minHeight:62,paddingHorizontal:22,paddingBottom:0,borderTopWidth:0,borderBottomWidth:1},
  navItem: {
    flex: 1,
    minHeight: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  desktopNavItem:{minHeight:61,flexDirection:"row",gap:8},
  navIcon: {
    width: 42,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  desktopNavIcon:{width:36,height:32},
  navIconOn: { backgroundColor: C.green },
  navText: { marginTop: 2, color: C.muted, fontSize: 11, fontWeight: "700" },
  navTextOn: { color: C.dark, fontWeight: "700" },
  headerHome: {
    minHeight: 42,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: C.green,
  },
  headerHomeText: { color: C.white, fontSize: 14, fontWeight: "700" },
  desktopBrand:{color:C.ink,fontSize:18,fontWeight:"600",letterSpacing:5},
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
    fontWeight: "700",
    textTransform: "uppercase",
  },
  pageTitle: {
    marginTop: 18,
    color: C.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: { marginTop: 4, color: C.muted, fontSize: 16, lineHeight: 24 },
  scroll: { paddingBottom: 34 },
  quickScroll: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 34 },
  quickSection:{marginTop:24},
  quickSectionTitle:{color:C.ink,fontSize:18,fontWeight:"700",letterSpacing:-.25},
  quickSectionHelp:{marginTop:3,color:C.muted,fontSize:13,lineHeight:18},
  quickGrid: {
    marginTop: 11,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  quickCard: {
    minHeight: 188,
    padding: 17,
    borderWidth:1,
    borderColor:C.border,
    borderRadius: 14,
    shadowColor: "#0D1722",
    shadowOpacity: 0.045,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  quickIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  quickTitle: { marginTop: 13, color: C.ink, fontSize: 19, fontWeight: "700", letterSpacing:-.3 },
  quickHelp: { marginTop: 6, flex: 1, color: C.muted, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  quickGo: {
    minHeight: 38,
    marginTop: 12,
    paddingHorizontal: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  quickGoText: { fontSize: 13, fontWeight: "700" },
  quickNote: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.redSoft,
    color: C.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  missedBanner: {
    marginBottom: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: C.orange,
  },
  eventBanner:{marginBottom:14,padding:13,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:"#DDE8E1",borderRadius:11,backgroundColor:C.accentSoft},
  eventBannerTitle:{color:C.accentDark,fontSize:15,fontWeight:"700"},
  eventBannerText:{marginTop:2,color:C.muted,fontSize:13},
  sellStartPage:{paddingTop:6,paddingBottom:40},
  sellModeCard:{minHeight:112,marginTop:12,padding:16,flexDirection:"row",alignItems:"center",gap:13,borderWidth:1,borderColor:C.border,borderRadius:13},
  sellModeIcon:{width:58,height:58,alignItems:"center",justifyContent:"center",borderRadius:29},
  sellModeTitle:{color:C.ink,fontSize:21,fontWeight:"700"},
  sellModeHelp:{marginTop:4,color:C.muted,fontSize:14},
  earlierSale:{minHeight:70,marginTop:14,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:C.border,borderRadius:11,backgroundColor:C.white},
  earlierSaleTitle:{color:C.ink,fontSize:15,fontWeight:"700"},
  earlierSaleHelp:{marginTop:2,color:C.muted,fontSize:12},
  missedBannerTitle: { color: C.white, fontSize: 18, fontWeight: "700" },
  missedBannerText: { marginTop: 3, color: C.white, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  step: {
    marginTop: 12,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    backgroundColor: C.soft,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.green,
  },
  stepNumber: { color: C.white, fontSize: 16, fontWeight: "700" },
  stepText: {
    flex: 1,
    color: C.dark,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
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
    borderRadius: 12,
    backgroundColor: C.white,
  },
  searchInput: { flex: 1, minHeight: 52, color: C.ink, fontSize: 17 },
  chips: { minHeight: 60, gap: 9, alignItems: "center", paddingVertical: 9 },
  stockFilterLabel: {
    marginTop: 13,
    marginBottom: 7,
    color: C.dark,
    fontSize: 14,
    fontWeight: "700",
  },
  stockFilterWrap: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stockFilters:{marginTop:12,padding:13,borderWidth:1,borderColor:C.border,borderRadius:16,backgroundColor:C.soft},
  stockCategoryPicker: {
    minHeight: 52,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 17,
    backgroundColor: C.white,
  },
  stockCategoryPickerIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: C.accentSoft,
  },
  stockCategoryPickerText: { flex: 1, color: C.ink, fontSize: 16, fontWeight: "700" },
  stockCategoryChange: { color: C.accent, fontSize: 12, fontWeight: "700" },
  categoryMenu:{marginTop:7,overflow:"hidden",borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white,shadowColor:"#0D1722",shadowOpacity:.08,shadowRadius:12,shadowOffset:{width:0,height:6},elevation:3},
  categoryMenuRow:{minHeight:50,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:11,borderBottomWidth:1,borderBottomColor:"#EEF0F2"},
  categoryMenuRowOn:{backgroundColor:C.accentSoft},
  categoryMenuText:{flex:1,color:C.ink,fontSize:15,fontWeight:"700"},
  stockSortRow: {
    flexDirection: "row",
    gap: 8,
  },
  stockResultCount: {
    marginTop: 12,
    color: C.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  categoryGrid: {
    marginTop: 16,
    paddingBottom: 26,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  categoryCard: {
    padding: 18,
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderRadius: 15,
    borderWidth: 1,
  },
  categoryCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryCardText: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "700",
  },
  desktopCategoryTabs: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  chip: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.white,
  },
  chipOn: { borderColor: C.green, backgroundColor: C.green },
  chipText: { color: C.ink, fontSize: 14, fontWeight: "700" },
  chipTextOn: { color: C.white },
  productList: { paddingBottom: 26 },
  productListBasket: { paddingBottom: 118 },
  productRow: { gap: 11 },
  productCard: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 188,
    marginBottom: 9,
    padding: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
    shadowColor: "#0D1F2D",
    shadowOpacity: 0.04,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  disabled: { opacity: 0.78 },
  productOn: {
    borderWidth: 2.5,
    borderColor: C.green,
    backgroundColor: "#FCFDFF",
  },
  productVisual: {
    width: "100%",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginBottom: 7,
    borderWidth:1,
    borderColor:"#EEF0F2",
    backgroundColor: C.white,
  },
  productCardImage: { width: "100%", height: "100%", resizeMode: "contain", objectFit:"contain" },
  missingPhoto: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#F0EDE7",
  },
  missingPhotoText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
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
    fontWeight: "700",
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
  badgeText: { color: C.white, fontSize: 16, fontWeight: "700" },
  saleBadge: {
    position: "absolute",
    top: 7,
    left: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: C.red,
  },
  saleBadgeText: { color: C.white, fontSize: 9, fontWeight: "700", letterSpacing: 0.7 },
  stockBadge: {
    position: "absolute",
    left: 7,
    bottom: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: "rgba(13,31,45,0.88)",
  },
  stockBadgeLow: { backgroundColor: "rgba(121,34,56,0.92)" },
  stockBadgeText: { color: C.white, fontSize: 10, fontWeight: "700" },
  productName: {
    minHeight: 34,
    color: C.ink,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "700",
  },
  productPrice: {
    marginTop: 1,
    color: C.dark,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  saleLine: { marginTop: 3, color: C.red, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  oldPrice: { color: C.muted, textDecorationLine: "line-through" },
  stock: { marginTop: 4, color: C.green, fontSize: 14, lineHeight: 19, fontWeight: "700" },
  low: { color: C.orange, fontWeight: "700" },
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
  basketTotal: { marginTop: 2, color: C.ink, fontSize: 25, fontWeight: "700" },
  reviewButton: {
    minHeight: 60,
    paddingHorizontal: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 7,
    backgroundColor: C.green,
  },
  reviewText: { color: C.white, fontSize: 16, fontWeight: "700" },
  back: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
  },
  backTitle: { color: C.ink, fontSize: 22, fontWeight: "700" },
  cartRow: {
    minHeight: 88,
    marginTop: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.white,
  },
  cartProductTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  cartProductBottom: {
    marginTop: 10,
    paddingTop: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: C.border,
  },
  quantityLabel: { color: C.muted, fontSize: 13, fontWeight: "700" },
  rowTitle: { color: C.ink, fontSize: 16, fontWeight: "700" },
  rowHelp: { marginTop: 3, color: C.muted, fontSize: 13, lineHeight: 18 },
  lineTotal: {
    minWidth: 65,
    color: C.ink,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  quantity: { flexDirection: "row", alignItems: "center", gap: 5 },
  qtyButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: C.soft,
  },
  qtyNumber: {
    minWidth: 30,
    color: C.ink,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  totalBox: {
    marginTop: 14,
    padding: 19,
    borderRadius: 10,
    backgroundColor: C.dark,
  },
  totalLabel: { color: "#DDE4FF", fontSize: 15, fontWeight: "700" },
  totalValue: { marginTop: 5, color: C.white, fontSize: 34, fontWeight: "700" },
  section: {
    marginTop: 24,
    marginBottom: 9,
    color: C.ink,
    fontSize: 19,
    fontWeight: "700",
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
    borderRadius: 13,
    backgroundColor: C.white,
  },
  choiceOn: { borderWidth: 2.5, borderColor: C.green, backgroundColor: C.soft },
  choiceDanger: { borderColor: C.red, backgroundColor: C.redSoft },
  choiceText: { color: C.muted, fontSize: 15, fontWeight: "700" },
  bigButton: {
    minHeight: 62,
    marginTop: 18,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 14,
    backgroundColor: C.green,
    shadowColor: C.green,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  bigButtonText: { color: C.white, fontSize: 17, fontWeight: "700" },
  safe: { marginTop: 11, color: C.muted, fontSize: 13, textAlign: "center" },
  hero: {
    marginTop: 16,
    padding: 21,
    borderRadius: 16,
    backgroundColor: C.dark,
  },
  heroLabel: { color: "#DDE4FF", fontSize: 15, fontWeight: "700" },
  heroValue: { marginTop: 5, color: C.white, fontSize: 36, fontWeight: "700" },
  heroSmall: { marginTop: 5, color: "#DDE4FF", fontSize: 13 },
  stats: { marginTop: 10, flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.white,
  },
  statLabel: { marginTop: 8, color: C.muted, fontSize: 13, fontWeight: "700" },
  statValue: { marginTop: 3, color: C.ink, fontSize: 20, fontWeight: "700" },
  soldRow: {
    minHeight: 66,
    marginBottom: 7,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
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
  soldName: { flex: 1, color: C.ink, fontSize: 15, fontWeight: "700" },
  soldQty: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.green,
  },
  soldQtyText: { color: C.white, fontSize: 18, fontWeight: "700" },
  receipt: {
    marginBottom: 9,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
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
    fontWeight: "700",
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
    borderRadius: 13,
    backgroundColor: C.white,
  },
  editHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  editName: { color: C.ink, fontSize: 22, fontWeight: "700" },
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
    maxWidth: 420,
    aspectRatio: 1,
    alignSelf: "center",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#EEF2F7",
  },
  productPhotoImage: { width: "100%", height: "100%", resizeMode: "contain" },
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
  stockListImage:{width:52,height:52,borderWidth:1,borderColor:C.border,borderRadius:12,resizeMode:"contain",backgroundColor:C.white},
  listImage: { width: 58, height: 58, borderRadius: 16, resizeMode: "cover" },
  manageCategoryButton: { minHeight: 48, marginTop: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, backgroundColor: C.soft },
  manageCategoryText: { color: C.dark, fontSize: 14, fontWeight: "700" },
  categoryManageRow: { minHeight: 72, marginTop: 9, padding: 10, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: C.border, borderRadius: 18, backgroundColor: C.white },
  categoryManageIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.soft },
  smallAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.soft },
  smallActionDanger: { backgroundColor: C.redSoft },
  cancelCategory: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelCategoryText: { color: C.muted, fontSize: 14, fontWeight: "700" },
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
    fontWeight: "700",
    textAlign: "center",
  },
  rowPrice: { color: C.dark, fontSize: 16, fontWeight: "700" },
  stockBig: {
    marginTop: 22,
    color: C.dark,
    fontSize: 48,
    fontWeight: "700",
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
    fontWeight: "700",
    textAlign: "center",
  },
  stockNum: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal:7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.soft,
  },
  stockNumLow: { backgroundColor: C.orangeSoft },
  stockNumText: { color: C.dark, fontSize: 19, fontWeight: "700" },
  stockNumLabel:{marginTop:-2,color:C.muted,fontSize:11,fontWeight:"600",textTransform:"uppercase",letterSpacing:.35},
  priceListHero:{marginTop:14,padding:20,flexDirection:"row",alignItems:"center",gap:16,borderWidth:1,borderColor:C.border,borderRadius:13,backgroundColor:"#F5F7F8"},
  priceListKicker:{color:C.accent,fontSize:11,fontWeight:"700",letterSpacing:1.5},
  priceListTitle:{marginTop:5,color:C.ink,fontSize:26,fontWeight:"700",letterSpacing:-.5},
  priceListHelp:{marginTop:4,color:C.muted,fontSize:14,lineHeight:20},
  priceWarning:{marginTop:10,padding:12,flexDirection:"row",alignItems:"center",gap:8,borderRadius:10,backgroundColor:C.orangeSoft},
  priceWarningText:{flex:1,color:C.ink,fontSize:13,fontWeight:"600"},
  priceActions:{marginTop:12,flexDirection:"row",gap:9},
  pricePrimary:{minHeight:50,flex:1,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderRadius:10,backgroundColor:C.dark},
  pricePrimaryText:{color:C.white,fontSize:14,fontWeight:"700"},
  priceSecondary:{minHeight:50,flex:1,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white},
  priceSecondaryText:{color:C.dark,fontSize:14,fontWeight:"700"},
  priceSection:{marginTop:18,overflow:"hidden",borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.white},
  priceSectionMark:{height:4,width:"100%"},
  priceSectionTitle:{paddingHorizontal:14,paddingTop:13,paddingBottom:9,color:C.ink,fontSize:18,fontWeight:"700"},
  priceRow:{minHeight:52,paddingHorizontal:14,paddingVertical:9,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,borderTopWidth:1,borderTopColor:"#ECEEEF"},
  priceName:{flex:1,color:C.ink,fontSize:14,lineHeight:19,fontWeight:"600"},
  priceRight:{alignItems:"flex-end"},
  priceValue:{color:C.dark,fontSize:17,fontWeight:"700"},
  priceSaleTag:{marginBottom:1,color:C.red,fontSize:9,fontWeight:"700",letterSpacing:.8},
  priceMissing:{color:C.orange,fontSize:12},
  menu: {
    minHeight: 90,
    marginTop: 10,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
  },
  menuIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: C.soft,
  },
  menuTitle: { color: C.ink, fontSize: 17, fontWeight: "700" },
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
  addText: { color: C.green, fontSize: 15, fontWeight: "700" },
  cancel: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  account: {
    minHeight: 80,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
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
  avatarText: { color: C.white, fontSize: 21, fontWeight: "700" },
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
  signoutText: { color: C.red, fontSize: 16, fontWeight: "700" },
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
    borderRadius: 18,
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
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  guideCount: {
    marginLeft: "auto",
    marginRight: 10,
    color: C.muted,
    fontSize: 13,
    fontWeight: "700",
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
    borderRadius: 18,
    backgroundColor: C.green,
  },
  guideTitle: {
    marginTop: 18,
    color: C.ink,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: "700",
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
    fontWeight: "700",
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
  guideBackText: { color: C.dark, fontSize: 16, fontWeight: "700" },
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
  guideNextText: { color: C.white, fontSize: 16, fontWeight: "700" },
  gcashCheck: {
    marginTop: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
  },
  cashCalculator: {
    marginTop: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.accentSoft,
    borderRadius: 14,
    backgroundColor: C.white,
  },
  pastSaleCard: { marginTop: 14, padding: 14, borderWidth: 1, borderColor: C.border, borderRadius: 20, backgroundColor: C.white },
  pastSaleTop: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10 },
  pastSaleIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.soft },
  pastSaleFields: { marginTop: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: C.border },
  cashIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.accentSoft,
  },
  cashInput: {
    minHeight: 68,
    marginTop: 14,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: C.accent,
    borderRadius: 12,
    backgroundColor: C.cream,
    color: C.ink,
    fontSize: 28,
    fontWeight: "700",
  },
  quickCashRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  quickCash: {
    minHeight: 46,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.accentSoft,
  },
  quickCashText: { color: C.accentDark, fontSize: 15, fontWeight: "700" },
  changeBox: {
    marginTop: 14,
    padding: 16,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: C.accentDark,
  },
  changeBoxShort: { backgroundColor: C.red },
  changeValue: { marginTop: 4, color: C.white, fontSize: 34, fontWeight: "700" },
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
    borderRadius: 13,
    backgroundColor: C.soft,
  },
  receivedButtonOn: { backgroundColor: C.accent, borderColor: C.accent },
  receivedText: {
    flexShrink: 1,
    color: C.dark,
    fontSize: 16,
    fontWeight: "700",
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
    fontWeight: "700",
  },
  variantHint: { marginTop: 4, color: C.teal, fontSize: 12, fontWeight: "700" },
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
    borderRadius: 18,
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
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  variantTitle: { marginTop: 3, color: C.ink, fontSize: 21, fontWeight: "700" },
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
    borderRadius: 12,
    backgroundColor: C.white,
  },
  variantButtonOn: {
    borderWidth: 3,
    borderColor: C.green,
    backgroundColor: C.green,
  },
  variantButtonText: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  variantButtonTextOn: { color: C.white },
  variantStock: {
    marginTop: 3,
    color: C.teal,
    fontSize: 11,
    fontWeight: "700",
  },
  variantStockOn: { color: C.white },
  variantRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: C.white,
  },
  designButton: {
    width: "100%",
    minHeight: 92,
    padding: 16,
    borderWidth: 2,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.white,
  },
  designButtonText: { color: C.ink, fontSize: 20, fontWeight: "700" },
  designPrice: { marginTop: 5, color: C.green, fontSize: 24, fontWeight: "700" },
  designStock: { marginTop: 3, color: C.muted, fontSize: 14, fontWeight: "700" },
  letterFooter: {
    width: "100%",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.white,
  },
  letterCount: {
    color: C.ink,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  letterAddButton: {
    width: "100%",
    minHeight: 64,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 14,
    backgroundColor: C.green,
  },
  letterAddText: { color: C.white, fontSize: 18, fontWeight: "700" },
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
  choiceToggleText: { color: C.muted, fontSize: 14, fontWeight: "700" },
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
  alphabetText: { color: C.dark, fontSize: 16, fontWeight: "700" },
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
  choicePillText: { color: C.teal, fontSize: 14, fontWeight: "700" },
  variantLetter: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.tealSoft,
  },
  variantLetterText: { color: C.teal, fontSize: 18, fontWeight: "700" },
});
