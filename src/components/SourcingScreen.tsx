import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "@/src/lib/supabase";
import { Text, TextInput } from "@/src/components/AppTypography";
import { userNotice } from "@/src/lib/userNotice";

type SourceItem = {
  id: string;
  name: string;
  product_url: string | null;
  platform: string;
  final_cost_sgd: number;
  order_quantity: number;
  selling_price_php: number | null;
  source_currency: "RMB" | "SGD";
  source_price: number;
  tax_percent: number;
  shipping_type: "free" | "paid";
  shipping_amount: number;
  currency_to_php_rate: number;
  category_name: string;
  idea_stage: string;
  status: "draft" | "active" | "archived";
  lead_time_text: string;
  featured: boolean;
  created_at: string;
  source_product_images: { image_url: string }[] | null;
  source_product_options: { source_price: number | null; selling_price_php: number | null }[] | null;
};
type OptionRow = {
  id: string;
  databaseId?: string;
  value: string;
  price: string;
  publicPrice: string;
  stockUnits: string;
};
type LocalImage = {
  uri: string;
  width: number;
  height: number;
  type: "product";
};
type SavedImage = { id: string; image_url: string; storage_path: string; image_type: LocalImage["type"] };
const sourcingCategories = [
  "3D products",
  "Filament",
  "Clicker parts",
  "Squishies",
  "Keychains",
  "Packaging",
  "Other",
];
const n = (value: string) => Math.max(0, Number(value) || 0);
const money = (value: number, currency: "SGD" | "PHP") =>
  new Intl.NumberFormat(currency === "SGD" ? "en-SG" : "en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "SGD" ? 2 : 0,
  }).format(value);

export function SourcingScreen({
  businessId,
  locationId,
  onBack,
  onCreateBundle,
}: {
  businessId: string;
  locationId: string;
  onBack: () => void;
  onCreateBundle?: () => void;
}) {
  const [items, setItems] = useState<SourceItem[]>([]);
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [customCategory, setCustomCategory] = useState("");
  const [link, setLink] = useState("");
  const [platform, setPlatform] = useState("Pinduoduo");
  const [supplier, setSupplier] = useState("");
  const [englishDescription, setEnglishDescription] = useState("");
  const [currency, setCurrency] = useState<"RMB" | "SGD">("SGD");
  const rmbToSgd = 0.18;
  const [taxPercent, setTaxPercent] = useState("3");
  const [shippingType, setShippingType] = useState<"free" | "paid">("free");
  const [shippingAmount, setShippingAmount] = useState("");
  const rate = String(currency === "SGD" ? 49 : (rmbToSgd ?? 0) * 49);
  const sourceToSgd = currency === "SGD" ? 1 : (rmbToSgd ?? 0);
  const changeCurrency = (next: "RMB" | "SGD") => {
    if (next === currency) return;
    const factor = next === "SGD" ? rmbToSgd : 1 / rmbToSgd;
    setOptions(rows => rows.map(row => ({ ...row, price: row.price ? String(Number((n(row.price) * factor).toFixed(4))) : "" })));
    setShippingAmount(value => value ? String(Number((n(value) * factor).toFixed(4))) : "");
    setCurrency(next);
  };
  const [marketPrice, setMarketPrice] = useState("");
  const [marketLink, setMarketLink] = useState("");
  const [sellingPhp, setSellingPhp] = useState("");
  const [leadTime, setLeadTime] = useState("Estimated 1–2 months");
  const [publishOnWebsite, setPublishOnWebsite] = useState(false);
  const [catalogTab, setCatalogTab] = useState<"official" | "ideas">("official");
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [importingPhotos, setImportingPhotos] = useState(false);
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("source_products")
      .select(
        "id,name,product_url,platform,final_cost_sgd,order_quantity,selling_price_php,source_currency,source_price,tax_percent,shipping_type,shipping_amount,currency_to_php_rate,category_name,idea_stage,status,lead_time_text,featured,created_at,source_product_options(source_price,selling_price_php)",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) userNotice("Products not loaded", error.message);
    const products = (data ?? []) as Omit<SourceItem, "source_product_images">[];
    const productIds = products.map((item) => item.id);
    let imageMap = new Map<string, { image_url: string }[]>();
    if (productIds.length) {
      const { data: imageRows, error: imageError } = await supabase
        .from("source_product_images")
        .select("source_product_id,image_url,sort_order")
        .in("source_product_id", productIds)
        .order("sort_order", { ascending: true });
      if (imageError) userNotice("Product photos not loaded", imageError.message);
      imageMap = (imageRows ?? []).reduce((map, row) => {
        const current = map.get(row.source_product_id) ?? [];
        current.push({ image_url: row.image_url });
        map.set(row.source_product_id, current);
        return map;
      }, new Map<string, { image_url: string }[]>());
    }
    setItems(products.map((item) => ({ ...item, source_product_images: imageMap.get(item.id) ?? [] })) as SourceItem[]);
    setLoading(false);
  }, [businessId]);
  useEffect(() => {
    void load();
  }, [load]);
  const deleteIdea = (item: SourceItem) => {
    const run = async () => {
      const { data: imageRows } = await supabase
        .from("source_product_images")
        .select("storage_path")
        .eq("source_product_id", item.id);
      const { error } = await supabase
        .from("source_products")
        .delete()
        .eq("id", item.id)
        .eq("business_id", businessId);
      if (error) {
        return userNotice(
          "Product idea not deleted",
          error.code === "23503"
            ? "This product is already used in a package. Remove it from the package first."
            : error.message,
        );
      }
      const paths = (imageRows ?? [])
        .map((row) => row.storage_path as string)
        .filter(Boolean);
      if (paths.length) {
        await supabase.storage.from("product-images").remove(paths);
      }
      await load();
      userNotice("Product idea deleted", `${item.name} has been removed.`);
    };
    const title = "Delete this product idea?";
    const message = `${item.name} and its saved variants will be removed. This cannot be undone.`;
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) void run();
      return;
    }
    Alert.alert(title, message, [
      { text: "Keep product", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  };
  const shippingCost = shippingType === "paid" ? n(shippingAmount) : 0;
  const pricedOptions = options.map((option) => n(option.price)).filter((price) => price > 0);
  const lowestVariantPrice = pricedOptions.length ? Math.min(...pricedOptions) : 0;
  const lowestVariantSourceCost = lowestVariantPrice * (1 + n(taxPercent) / 100) + shippingCost;
  const lowestVariantPhpCost = lowestVariantSourceCost * n(rate);
  const reset = () => {
    setName("");
    setCategory("Other");
    setCustomCategory("");
    setLink("");
    setPlatform("Pinduoduo");
    setSupplier("");
    setEnglishDescription("");
    setTaxPercent("3");
    setShippingType("free");
    setShippingAmount("");
    setCurrency("SGD");
    setMarketPrice("");
    setMarketLink("");
    setSellingPhp("");
    setLeadTime("Estimated 1–2 months");
    setPublishOnWebsite(false);
    setOptions([]);
    setImages([]);
    setSavedImages([]);
    setEditingId(null);
  };
  const addOption = () =>
    setOptions((v) => [
      ...v,
      {
        id: `${Date.now()}-${Math.random()}`,
        value: "",
        price: "",
        publicPrice: "",
        stockUnits: "1",
      },
    ]);
  const changeOption = (id: string, key: keyof OptionRow, value: string) =>
    setOptions((v) => v.map((x) => (x.id === id ? { ...x, [key]: value } : x)));
  const openItem = async (item: SourceItem) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("source_products")
      .select("*,source_product_options(id,option_value,source_price,selling_price_php),source_product_images(id,image_url,storage_path,image_type)")
      .eq("id", item.id)
      .eq("business_id", businessId)
      .single();
    setLoading(false);
    if (error || !data) return userNotice("Product not opened", error?.message ?? "Please try again.");
    setEditingId(data.id);
    setName(data.name ?? "");
    const savedCategory = data.category_name ?? "Other";
    if (sourcingCategories.includes(savedCategory)) { setCategory(savedCategory); setCustomCategory(""); }
    else { setCategory("Other"); setCustomCategory(savedCategory); }
    setLink(data.product_url ?? "");
    setPlatform(data.platform ?? "Pinduoduo");
    setSupplier(data.supplier_name ?? "");
    setEnglishDescription(data.english_description ?? "");
    setSellingPhp(data.selling_price_php == null ? "" : String(data.selling_price_php));
    setLeadTime(data.lead_time_text ?? "Estimated 1–2 months");
    setPublishOnWebsite(data.status === "active");
    setTaxPercent(String(data.tax_percent ?? 3));
    setShippingType(data.shipping_type === "paid" ? "paid" : "free");
    setShippingAmount(data.shipping_amount ? String(data.shipping_amount) : "");
    setCurrency(data.source_currency === "RMB" ? "RMB" : "SGD");
    setOptions((data.source_product_options ?? []).map((option: any) => ({ id: option.id, databaseId: option.id, value: option.option_value ?? "", price: option.source_price == null ? "" : String(option.source_price), stockUnits: String(option.stock_units ?? 1), publicPrice: option.selling_price_php == null ? "" : String(option.selling_price_php) })));
    setSavedImages((data.source_product_images ?? []) as SavedImage[]);
    setImages([]);
    setEditing(true);
  };
  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return userNotice(
        "Photo access needed",
        "Allow MIK to choose product images or screenshots.",
      );
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
    });
    if (!result.canceled)
      setImages((v) =>
        [
          ...v,
          ...result.assets.map((a) => ({
            uri: a.uri,
            width: a.width,
            height: a.height,
            type: "product" as const,
          })),
        ].slice(0, 12),
      );
  };
  const addBrowserPhotos = useCallback(async (files: File[]) => {
    const photoFiles = files.filter(file => /^image\/(png|jpeg|webp|gif)$/i.test(file.type));
    if (!photoFiles.length) return;
    const available = Math.max(0, 12 - savedImages.length - images.length);
    if (!available) { userNotice("Photo limit reached", "You can add up to 12 photos per product."); return; }
    setImportingPhotos(true);
    try {
      const photos = await Promise.all(photoFiles.slice(0, available).map(async file => {
        if (file.size > 20 * 1024 * 1024) throw new Error("Choose photos smaller than 20 MB.");
        const uri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("This photo could not be read."));
          reader.readAsDataURL(file);
        });
        const dimensions = await new Promise<{width:number;height:number}>((resolve, reject) => Image.getSize(uri, (width, height) => resolve({width,height}), reject));
        return { uri, ...dimensions, type: "product" as const };
      }));
      setImages(current => [...current, ...photos].slice(0, Math.max(0, 12 - savedImages.length)));
    } catch (error) { userNotice("Photo not added", (error as Error).message || "Try uploading the image file instead."); }
    finally { setImportingPhotos(false); }
  }, [images.length, savedImages.length]);
  useEffect(() => {
    if (Platform.OS !== "web" || !editing) return;
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? []).filter(item => item.kind === "file" && item.type.startsWith("image/")).map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
      if (!files.length) return; // Leave ordinary text and link pasting unchanged.
      event.preventDefault();
      void addBrowserPhotos(files);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [editing, addBrowserPhotos]);
  const addDroppedImages = (event: any) => {
    event?.preventDefault?.();
    const files = Array.from(event?.dataTransfer?.files ?? []) as File[];
    void addBrowserPhotos(files);
  };
  const save = async () => {
    if (importingPhotos) return userNotice("Photo is loading", "Wait for the photo preview, then save the product.");
    const wasEditing = Boolean(editingId);
    if (!name.trim())
      return userNotice("Product name needed", "Enter the product name.");
    if (n(rate) <= 0)
      return userNotice(
        "RMB conversion unavailable",
        "Retry the currency conversion, or enter the supplier price in SGD.",
      );
    if (options.some((x) => !x.value.trim()))
      return userNotice(
        "Complete the options",
        "Enter a name for every variant or choice, or remove the empty row.",
      );
    if(options.some(x=>!Number.isInteger(Number(x.stockUnits))||Number(x.stockUnits)<=0)) return userNotice("Pieces per selection needed","Use a whole number. For one item enter 1; for a pack of 50 enter 50.");
    if (!Number.isFinite(Number(taxPercent)) || Number(taxPercent) <= 0)
      return userNotice("Tax needed", "Enter a tax percentage greater than zero. The default is 3%.");
    if (shippingType === "paid" && n(shippingAmount) <= 0)
      return userNotice("Shipping cost needed", `Enter the estimated supplier shipping cost in ${currency}.`);
    if (publishOnWebsite && (options.some(option => n(option.publicPrice || sellingPhp) <= 0) || (!options.length && n(sellingPhp) <= 0)))
      return userNotice("Customer price needed", "Every official variant must have a customer price greater than zero.");
    if (publishOnWebsite && !englishDescription.trim())
      return userNotice("Product details needed", "Add a short customer-facing description before publishing.");
    if (publishOnWebsite && !leadTime.trim())
      return userNotice("Waiting time needed", "Tell customers how long this preorder normally takes.");
    if (publishOnWebsite && savedImages.length + images.length === 0)
      return userNotice("Product photo needed", "Add at least one photo before publishing this product.");
    if (publishOnWebsite && !sellingPhp && (!options.length || options.some((option) => !option.publicPrice)))
      return userNotice("Customer price needed", "Enter one product price, or enter a customer price for every variant.");
    setSaving(true);
    try {
    const legacySgdCost = lowestVariantSourceCost * sourceToSgd;
    const productValues = {
        business_id: businessId,
        location_id: locationId,
        name: name.trim(),
        product_url: link.trim() || null,
        category_name:
          category === "Other" && customCategory.trim()
            ? customCategory.trim()
            : category,
        idea_stage: "idea",
        platform,
        original_description: null,
        english_description: englishDescription.trim() || null,
        source_currency: currency,
        source_price: 0,
        tax_percent: n(taxPercent),
        shipping_type: shippingType,
        shipping_amount: shippingCost,
        currency_to_php_rate: n(rate),
        final_cost_sgd: legacySgdCost,
        exchange_rate_sgd_php: 49,
        order_quantity: 1,
        deposit_percent: 50,
        market_reference_price_php: marketPrice ? n(marketPrice) : null,
        market_reference_url: marketLink.trim() || null,
        selling_price_php: sellingPhp ? n(sellingPhp) : null,
        lead_time_text: leadTime.trim() || "Estimated 1–2 months",
        status: "draft",
      };
    const productRequest = editingId
      ? supabase.from("source_products").update(productValues).eq("id", editingId).eq("business_id", businessId)
      : supabase.from("source_products").insert(productValues);
    const { data, error } = await productRequest.select("id").single();
    if (error) {
      setSaving(false);
      return userNotice("Product not saved", error.message);
    }
    const productId = data.id as string;
    // Retry the same product after a variant/photo failure instead of inserting a duplicate.
    setEditingId(productId);
    if (editingId) {
      const { data: oldOptions, error: oldOptionsError } = await supabase.from("source_product_options").select("id").eq("source_product_id", productId);
      if (oldOptionsError) throw oldOptionsError;
      const keptIds = options.map((option) => option.databaseId).filter(Boolean) as string[];
      const removedIds = (oldOptions ?? []).map((option) => option.id).filter((id) => !keptIds.includes(id));
      if (removedIds.length) {
        const { error: removeError } = await supabase.from("source_product_options").delete().in("id", removedIds);
        if (removeError) { setSaving(false); return userNotice("Variant not removed", removeError.code === "23503" ? "This variant is already used in a package." : removeError.message); }
      }
      for (let index = 0; index < options.length; index++) {
        const option = options[index];
        const values = { option_type: "Variant", option_value: option.value.trim(), source_price: option.price ? n(option.price) : null, price_sgd: option.price ? n(option.price) * sourceToSgd : null, selling_price_php: option.publicPrice ? n(option.publicPrice) : null, stock_units: Number(option.stockUnits), minimum_quantity: 1, sort_order: index };
        const request = option.databaseId
          ? supabase.from("source_product_options").update(values).eq("id", option.databaseId).eq("source_product_id", productId)
          : supabase.from("source_product_options").insert({ source_product_id: productId, ...values });
        const { error: optionError } = await request;
        if (optionError) { setSaving(false); return userNotice("Variant not saved", optionError.message); }
      }
    } else if (options.length) {
      const { error: optionError } = await supabase.from("source_product_options").insert(
          options.map((x, index) => ({
            source_product_id: productId,
            option_type: "Variant",
            option_value: x.value.trim(),
            source_price: x.price ? n(x.price) : null,
            price_sgd: x.price ? n(x.price) * sourceToSgd : null,
            selling_price_php: x.publicPrice ? n(x.publicPrice) : null,
            stock_units: Number(x.stockUnits),
            minimum_quantity: 1,
            sort_order: index,
          })));
      if (optionError) {
        setSaving(false);
        return userNotice("Options not saved", optionError.message);
      }
    }
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const resized = await ImageManipulator.manipulateAsync(
          image.uri,
          [
            image.width >= image.height
              ? { resize: { width: 1400 } }
              : { resize: { height: 1400 } },
          ],
          { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
        );
        const response = await fetch(resized.uri);
        const path = `${businessId}/sourcing/${productId}/${Date.now()}-${i}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(path, await response.arrayBuffer(), {
            contentType: "image/jpeg",
          });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        const imageUrl = supabase.storage
          .from("product-images")
          .getPublicUrl(path).data.publicUrl;
        const { error: imageError } = await supabase
          .from("source_product_images")
          .insert({
            source_product_id: productId,
            image_url: imageUrl,
            storage_path: path,
            image_type: image.type,
            sort_order: i,
          });
        if (imageError) throw imageError;
      }
    } catch (imageError: any) {
      setSaving(false);
      return userNotice(
        "Product saved, but some images failed",
        imageError?.message ?? "You can add them again later.",
      );
    }
    if (publishOnWebsite) {
      const { error: publishError } = await supabase
        .from("source_products")
        .update({ status: "active" })
        .eq("id", productId)
        .eq("business_id", businessId);
      if (publishError) {
        setSaving(false);
        return userNotice("Product saved but not published", publishError.message);
      }
    }
    setSaving(false);
    reset();
    setEditing(false);
    await load();
    userNotice(
      wasEditing ? "Product updated" : "Product saved",
      publishOnWebsite ? "Official product saved. It now appears in the VIAE shop." : "Your private idea is saved. It does not appear on the website.",
    );
    } catch (error) {
      userNotice("Product not fully saved", (error as {message?:string})?.message || "Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };
  const tabItems = items.filter(item => catalogTab === "official" ? item.status === "active" : item.status !== "active");
  const itemCategories = Array.from(
    new Set(tabItems.map((item) => item.category_name).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const shownItems = categoryFilter === "all" ? tabItems : tabItems.filter(item => item.category_name === categoryFilter);
  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#315FBE" />
        <Text style={styles.help}>Opening sourced products…</Text>
      </View>
    );
  if (!editing)
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Header title="Products" onBack={onBack} />
        {onCreateBundle?<Pressable style={styles.secondary} onPress={onCreateBundle}><Text style={styles.secondaryText}>Manage set packages</Text></Pressable>:null}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="bag-handle-outline" size={25} color="#315FBE" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>Your product catalogue</Text>
            <Text style={styles.help}>
              Official products appear in the shop. Ideas are private until ready.
            </Text>
          </View>
        </View>
        <View style={styles.chips}>
          <Chip tone="blue" label={`Official products ${items.filter(item => item.status === "active").length}`} active={catalogTab === "official"} onPress={() => {setCatalogTab("official"); setCategoryFilter("all");}} />
          <Chip tone="purple" label={`Ideas ${items.filter(item => item.status !== "active").length}`} active={catalogTab === "ideas"} onPress={() => {setCatalogTab("ideas"); setCategoryFilter("all");}} />
        </View>
        <Pressable style={styles.primary} onPress={() => {setPublishOnWebsite(catalogTab === "official"); setEditing(true);}}>
          <Ionicons name="add" size={22} color="white" />
          <Text style={styles.primaryText}>Add product</Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <Chip
            label={`All ${tabItems.length}`}
            active={categoryFilter === "all"}
            onPress={() => setCategoryFilter("all")}
          />
          {itemCategories.map((itemCategory) => (
            <Chip
              key={itemCategory}
              label={`${itemCategory} ${tabItems.filter((item) => item.category_name === itemCategory).length}`}
              active={categoryFilter === itemCategory}
              onPress={() => setCategoryFilter(itemCategory)}
            />
          ))}
        </ScrollView>
        {shownItems.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.cardTitle}>
              {items.length ? "No products in this category" : "No products yet"}
            </Text>
            <Text style={styles.help}>
              Add the first item you may buy and resell.
            </Text>
          </View>
        ) : (
          shownItems.map((item) => {
            const variantPrices = (item.source_product_options ?? [])
              .map((option) => Number(option.source_price || 0))
              .filter((price) => price > 0);
            const lowestPrice = variantPrices.length ? Math.min(...variantPrices) : 0;
            const supplierPriceSgd = (lowestPrice * (1 + Number(item.tax_percent || 0) / 100) +
              (item.shipping_type === "paid" ? Number(item.shipping_amount || 0) : 0)) *
              (item.source_currency === "RMB" ? 0.18 : 1);
            return (
            <View key={item.id} style={styles.item}>
              {item.source_product_images?.[0]?.image_url ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`View full photo of ${item.name}`} onPress={() => setExpandedImage(item.source_product_images![0].image_url)}>
                  <Image
                    source={{ uri: item.source_product_images[0].image_url }}
                    style={styles.thumb as any}
                    resizeMode="cover"
                  />
                </Pressable>
              ) : (
                <View style={styles.thumbEmpty}>
                  <Ionicons name="image-outline" size={24} color="#737B89" />
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.categoryTag}>{item.category_name}</Text>
                  <Text style={item.status === "active" ? styles.liveTag : styles.draftTag}>
                    {item.status === "active" ? "Official · On VIAE" : "Private idea"}
                  </Text>
                </View>
                <Text style={styles.help}>
                  {item.product_url ? `${item.platform} · ` : ""}
                  {variantPrices.length ? `${variantPrices.length} priced ${variantPrices.length === 1 ? "variant" : "variants"}` : "Add a variant price"}
                </Text>
                {lowestPrice > 0 ? (
                  <Text style={styles.price}>
                    Supplier cost from {money(supplierPriceSgd, "SGD")} · {money(supplierPriceSgd * 49, "PHP")}
                  </Text>
                ) : null}
                {lowestPrice > 0 ? <Text style={styles.help}>Includes selected tax and shipping</Text> : null}
                <View style={styles.itemActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`View or edit ${item.name}`} style={styles.editIdea} onPress={() => void openItem(item)}>
                    <Ionicons name="create-outline" size={16} color="#315FBE" />
                    <Text style={styles.editIdeaText}>View / edit</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} style={styles.deleteIdea} onPress={() => deleteIdea(item)}>
                    <Ionicons name="trash-outline" size={16} color="#8A2943" />
                    <Text style={styles.deleteIdeaText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            );
          })
        )}
        <PhotoViewer uri={expandedImage} onClose={() => setExpandedImage(null)} />
      </ScrollView>
    );
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Header
        title={editingId ? "View or edit product" : "Add product"}
        onBack={() => {
          reset();
          setEditing(false);
        }}
      />
      <Section number="1" title="Product">
        <Text style={styles.label}>Product type</Text>
        <View style={styles.chips}>
          <Chip label="Official · In website shop" active={publishOnWebsite} onPress={() => setPublishOnWebsite(true)} />
          <Chip label="Idea · Private" active={!publishOnWebsite} onPress={() => setPublishOnWebsite(false)} />
        </View>
        <Text style={styles.note}>{publishOnWebsite ? "Official products appear in the VIAE Shop. Add a photo, description, waiting time and customer price." : "Ideas stay private. Make this official when it is ready to sell."}</Text>
        <Field
          label="Product name · Required"
          value={name}
          setValue={setName}
          placeholder="Example: Mini animal keychain"
        />
        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {sourcingCategories.map((value) => (
            <Chip
              key={value}
              label={value}
              active={category === value}
              onPress={() => setCategory(value)}
            />
          ))}
        </View>
        {category === "Other" ? (
          <Field
            label="Category name · Optional"
            value={customCategory}
            setValue={setCustomCategory}
            placeholder="Create your own category"
          />
        ) : null}
        <Field
          label="Product link · Optional"
          value={link}
          setValue={setLink}
          placeholder="Paste it now or add it later"
        />
        <Text style={styles.label}>Where is it from?</Text>
        <View style={styles.chips}>
          {["Pinduoduo", "Taobao", "Other"].map((x) => (
            <Chip
              key={x}
              label={x}
              active={platform === x}
              onPress={() => setPlatform(x)}
            />
          ))}
        </View>
      </Section>
      <Section number="2" title="Photos">
        <Text style={styles.help}>
          {width >= 700 ? "Drag product photos here, or use the button below." : "Tap below to add product photos from your phone."} MIK makes the files smaller before saving.
        </Text>
        {width >= 700 ? (
          <View
            style={styles.dropZone}
            {...({ onDragOver: (event: any) => event.preventDefault(), onDrop: addDroppedImages } as any)}
          >
            <Ionicons name="cloud-upload-outline" size={30} color="#315FBE" />
            <Text style={styles.dropTitle}>Paste or drop photos here</Text>
            <Text style={styles.help}>Copy an image, then press Ctrl+V (Windows) or ⌘+V (Mac). You can also upload a file.</Text>
            {importingPhotos ? <Text style={styles.note}>Adding photo…</Text> : null}
          </View>
        ) : null}
        <View style={styles.imageButtons}>
          <Pressable style={styles.secondary} onPress={() => void pickImages()}>
            <Ionicons name="images-outline" size={20} color="#315FBE" />
            <Text style={styles.secondaryText}>Add photos</Text>
          </Pressable>
        </View>
        <View style={styles.imageGrid}>
          {savedImages.map((image) => (
            <View key={image.id} style={styles.imageWrap}>
              <Pressable accessibilityRole="button" accessibilityLabel="View full product photo" onPress={() => setExpandedImage(image.image_url)}>
                <Image source={{ uri: image.image_url }} style={styles.preview as any} resizeMode="contain" />
              </Pressable>
            </View>
          ))}
          {images.map((image, index) => (
            <View key={`${image.uri}-${index}`} style={styles.imageWrap}>
              <Pressable accessibilityRole="button" accessibilityLabel="View full product photo" onPress={() => setExpandedImage(image.uri)}>
                <Image source={{ uri: image.uri }} style={styles.preview as any} resizeMode="contain" />
              </Pressable>
              <Pressable style={styles.imageRemove} onPress={() => setImages((v) => v.filter((_, i) => i !== index))}>
                <Ionicons name="close" size={16} color="white" />
              </Pressable>
            </View>
          ))}
        </View>
      </Section>
      <Section number="3" title="Product details">
        <Field label={`Product details · ${publishOnWebsite ? "Required" : "Optional for an idea"}`} value={englishDescription} setValue={setEnglishDescription} placeholder="Describe what the customer will receive" multiline />
      </Section>
      <Section number="4" title="Variants and costs">
        <Text style={styles.help}>
          Add each choice exactly as the supplier shows it, such as Pink, Large Blue or Pack of 50. Each choice can have its own price.
        </Text>
        <Text style={styles.label}>Supplier price currency</Text>
        <View style={styles.chips}>
          <Chip label="SGD" active={currency === "SGD"} onPress={() => changeCurrency("SGD")} />
          <Chip label="RMB" active={currency === "RMB"} onPress={() => changeCurrency("RMB")} />
        </View>
        <Text style={styles.note}>Prices and supplier shipping below use {currency}. Peso estimates are calculated automatically.</Text>
        <Text style={styles.label}>Tax · Required</Text>
        <View style={styles.chips}>
          <Chip label="3% tax" active={taxPercent === "3"} onPress={() => setTaxPercent("3")} />
        </View>
        <Text style={styles.label}>Supplier shipping</Text>
        <View style={styles.chips}>
          <Chip label="Free shipping" active={shippingType === "free"} onPress={() => { setShippingType("free"); setShippingAmount(""); }} />
          <Chip label="Paid shipping" active={shippingType === "paid"} onPress={() => setShippingType("paid")} />
        </View>
        {shippingType === "paid" ? <Field label={`Estimated shipping · ${currency}`} value={shippingAmount} setValue={setShippingAmount} keyboardType="decimal-pad" placeholder="0.00" /> : null}
        <Text style={styles.note}>These settings apply to every variant below.</Text>
        {options.map((row) => (
          <View key={row.id} style={styles.optionCard}>
            <Field
              label="Variant or choice · Required"
              value={row.value}
              setValue={(v) => changeOption(row.id, "value", v)}
              placeholder="Example: Pink, Large Blue or Pack of 50"
            />
            <Field
              label={`Price shown · ${currency}`}
              value={row.price}
              setValue={(v) => changeOption(row.id, "price", v)}
              keyboardType="decimal-pad"
              placeholder="Example: 50"
            />
            <Field
              label="Customer price · PHP"
              value={row.publicPrice}
              setValue={(v) => changeOption(row.id, "publicPrice", v)}
              keyboardType="decimal-pad"
              placeholder="Example: 499"
            />
            <Field label="Pieces in one selection · Required" value={row.stockUnits} setValue={value=>changeOption(row.id,"stockUnits",value)} keyboardType="number-pad" placeholder="1" />
            <Text style={styles.note}>Selling one selection deducts this many pieces. Use 50 for a pack of 50, or 1 for a single item.</Text>
            {row.price ? <View><Text style={styles.variantCost}>Supplier cost: {money((n(row.price) * (1 + n(taxPercent) / 100) + shippingCost) * sourceToSgd, "SGD")} · {money((n(row.price) * (1 + n(taxPercent) / 100) + shippingCost) * n(rate), "PHP")}</Text><Text style={styles.note}>Includes selected tax and shipping.</Text></View> : null}
            <Pressable
              style={styles.remove}
              onPress={() =>
                setOptions((v) => v.filter((x) => x.id !== row.id))
              }
            >
              <Ionicons name="trash-outline" size={17} color="#8A2943" />
              <Text style={styles.removeText}>Remove option</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.secondary} onPress={addOption}>
          <Ionicons name="add" size={20} color="#315FBE" />
          <Text style={styles.secondaryText}>Add another variant or choice</Text>
        </Pressable>
        <Text style={styles.note}>Supplier prices remain private. Customer prices are the only prices shown on VIAE.</Text>
      </Section>
      <Section number="5" title="Customer price and waiting time">
        <Text style={styles.help}>
          Official products appear in the VIAE shop automatically. Ideas stay private. Buying costs and supplier links never appear on the website.
        </Text>
        <Field
          label="Same price for all variants · PHP · Optional if each variant is priced"
          value={sellingPhp}
          setValue={setSellingPhp}
          keyboardType="decimal-pad"
          placeholder="Use this when every variant has the same price"
        />
        <Field
          label={`Estimated waiting time · ${publishOnWebsite ? "Required" : "Optional for an idea"}`}
          value={leadTime}
          setValue={setLeadTime}
          placeholder="Estimated 1–2 months"
        />
      </Section>
      <Pressable
        style={[styles.primary, saving && styles.disabled]}
        disabled={saving}
        onPress={() => void save()}
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <Ionicons name="checkmark" size={22} color="white" />
        )}
        <Text style={styles.primaryText}>{saving ? "Saving…" : editingId ? "Save changes" : "Save product"}</Text>
      </Pressable>
      <PhotoViewer uri={expandedImage} onClose={() => setExpandedImage(null)} />
    </ScrollView>
  );
}

function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerShade}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close full photo" style={styles.viewerClose} onPress={onClose}>
          <Ionicons name="close" size={25} color="white" />
        </Pressable>
        {uri ? <Image source={{ uri }} style={styles.viewerImage as any} resizeMode="contain" /> : null}
        <Text style={styles.viewerHelp}>Tap × to close</Text>
      </View>
    </Modal>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.back} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color="#151924" />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}
function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.number}>
          <Text style={styles.numberText}>{number}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
function Field({
  label,
  value,
  setValue,
  placeholder,
  multiline = false,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        keyboardType={keyboardType}
        autoCapitalize="sentences"
      />
    </View>
  );
}
function Chip({
  label,
  active,
  onPress,
  tone,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: "blue" | "purple";
}) {
  const colour = tone === "purple" ? "#7043A5" : "#315FBE";
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.chip, tone && {backgroundColor: tone === "purple" ? "#F1EBF8" : "#EBF1FC", borderColor: colour}, active && {backgroundColor: colour, borderColor: colour}]} onPress={onPress}>
      <Text style={[styles.chipText, tone && {color: colour}, active && styles.chipTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  page: {
    padding: 18,
    paddingBottom: 80,
    width: "100%",
    boxSizing: "border-box",
    maxWidth: 900,
    alignSelf: "center",
    gap: 16,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  back: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: "#E1E4EA",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  headerTitle: { fontSize: 21, fontWeight: "700", color: "#151924" },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#EEF3FF",
    borderWidth: 1,
    borderColor: "#D5E0F4",
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  title: { fontSize: 23, fontWeight: "700", color: "#151924", marginBottom: 3 },
  help: { fontSize: 14, lineHeight: 20, color: "#626A78" },
  primary: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#315FBE",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: { fontSize: 16, fontWeight: "700", color: "white" },
  disabled: { opacity: 0.55 },
  empty: {
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E1E4EA",
    alignItems: "center",
    gap: 5,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E1E4EA",
    backgroundColor: "white",
  },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#F4F5F7",
  },
  thumbEmpty: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#F4F5F7",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#151924" },
  price: { fontSize: 15, fontWeight: "700", color: "#315FBE", marginTop: 5 },
  section: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E1E4EA",
    backgroundColor: "white",
    gap: 12,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 1,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#EEF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontSize: 14, fontWeight: "800", color: "#315FBE" },
  sectionTitle: { fontSize: 19, fontWeight: "700", color: "#151924" },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: "#313744" },
  input: {
    minHeight: 47,
    borderWidth: 1,
    borderColor: "#D9DDE5",
    borderRadius: 12,
    paddingHorizontal: 13,
    fontSize: 16,
    color: "#151924",
    backgroundColor: "#FBFCFD",
  },
  textarea: { minHeight: 92, paddingTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterRow: { gap: 8, paddingVertical: 2, paddingRight: 18 },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 5,
    marginBottom: 3,
  },
  categoryTag: {
    fontSize: 12,
    fontWeight: "700",
    color: "#315FBE",
    backgroundColor: "#EEF3FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveTag: {
    fontSize: 12,
    fontWeight: "700",
    color: "#236146",
    backgroundColor: "#EAF5EF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  draftTag: {
    fontSize: 12,
    fontWeight: "700",
    color: "#626A78",
    backgroundColor: "#F1F3F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stageTag: {
    fontSize: 12,
    fontWeight: "700",
    color: "#594C8D",
    backgroundColor: "#F3F1F8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D9DDE5",
    backgroundColor: "white",
  },
  chipOn: { backgroundColor: "#315FBE", borderColor: "#315FBE" },
  chipText: { fontSize: 14, fontWeight: "600", color: "#4F5664" },
  chipTextOn: { color: "white" },
  optionCard: {
    gap: 11,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "#E6E8ED",
  },
  variantCost: { fontSize: 13, fontWeight: "700", color: "#315FBE" },
  two: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  half: { flexGrow: 1, flexBasis: 230, minWidth: 0 },
  secondary: {
    minHeight: 45,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D6F2",
    backgroundColor: "#F5F8FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  secondaryText: { fontSize: 15, fontWeight: "700", color: "#315FBE" },
  remove: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
  },
  removeText: { fontSize: 14, fontWeight: "600", color: "#8A2943" },
  itemActions: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  editIdea: {
    minHeight: 38,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#C8D6F2",
    borderRadius: 10,
    backgroundColor: "#F5F8FF",
  },
  editIdeaText: { fontSize: 13, fontWeight: "700", color: "#315FBE" },
  deleteIdea: {
    minHeight: 38,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E8C9D2",
    borderRadius: 10,
    backgroundColor: "#FCF4F6",
  },
  deleteIdeaText: { fontSize: 13, fontWeight: "700", color: "#8A2943" },
  summary: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F2F5FA",
    gap: 9,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#151924",
    textAlign: "right",
  },
  summaryStrong: {
    fontSize: 20,
    fontWeight: "800",
    color: "#315FBE",
    textAlign: "right",
  },
  note: { fontSize: 13, lineHeight: 18, color: "#626A78" },
  dropZone: {
    minHeight: 124,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#AFC2E7",
    borderRadius: 16,
    backgroundColor: "#F7F9FD",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: 18,
  },
  dropTitle: { fontSize: 16, fontWeight: "700", color: "#315FBE" },
  imageButtons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imageWrap: { width: 112 },
  preview: {
    width: 112,
    height: 112,
    borderRadius: 13,
    backgroundColor: "#F4F5F7",
    borderWidth: 1,
    borderColor: "#E1E4EA",
  },
  imageRemove: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#8A2943",
    alignItems: "center",
    justifyContent: "center",
  },
  imageType: {
    fontSize: 12,
    color: "#626A78",
    textTransform: "capitalize",
    marginTop: 4,
    textAlign: "center",
  },
  viewerShade: {
    flex: 1,
    padding: 18,
    backgroundColor: "rgba(8, 10, 16, .94)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerClose: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,.16)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  viewerImage: { width: "100%", height: "82%" },
  viewerHelp: { marginTop: 12, color: "white", fontSize: 13, fontWeight: "600" },
});
